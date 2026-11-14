import { drawMask, type Emitter, type InkId } from './mask'
import { createWebGL } from './webgl'
import { createWebGPU, type GPUBackend } from './webgpu'

export type Theme = 'light' | 'dark'

export interface BurstShape { dir?: [number, number]; spread?: number; steps?: number }

export interface InkInfo {
  path: string
  renderer: string
  grid: string
  stepMs: number
  fps: number
  running: boolean
}

export interface Ink {
  /** Resolves once a solver is drawing, or has failed; pages start the pour after it. */
  ready: Promise<void>
  /** Redraw the mask on the next frame: call after layout, scroll or emitter changes. */
  invalidate(): void
  setEmitters(list: Emitter[]): void
  /**
   * A burst at a viewport point: pushes the water outward and drops ink there.
   * `rx` and `ry` are its half-width and half-height in CSS px (default 57, round).
   * By default it pushes straight outward for one step. `dir` (CSS px axes, so
   * positive y is down) adds a push in that direction, `spread` scales the
   * outward part, and `steps` keeps pushing for that many steps, like a jet.
   * Up to four run at once; the rest wait their turn.
   */
  burst(x: number, y: number, ink: InkId, amount?: number, rx?: number, ry?: number, opts?: BurstShape): void
  /** Stir as if the pointer moved by (dx, dy) CSS px at (x, y). */
  stir(x: number, y: number, dx: number, dy: number): void
  setTheme(theme: Theme): void
  setRunning(on: boolean): void
  /** Run the solver ahead without drawing, so the page opens mid-pour. */
  preroll(steps: number, budgetMs: number): number
  info(): InkInfo
}

// Tunables, at a 256-row grid; both solvers read them.
const P = {
  damp: 0.9994, decay: 0.9972, grav: 0.7, conf: 4, sway: 0.03, push: 1.6,
  rate: 28, cap: 2.6, gain: 2.1, toe: 0.4, iters: 28, ptrR: 0.0032,
}
export type Tunables = typeof P

/** One solver step's input, worked out once here so both paths move the same way. */
export interface StepInput {
  p: Tunables
  dt: number; time: number; conf: number; decay: number; scroll: number
  asp: [number, number]; T: [number, number]; ptr: [number, number]; ptrV: [number, number]
  /** Up to four bursts, four floats each; see the force and dye passes. */
  bA: Float32Array; bB: Float32Array; bC: Float32Array
}

export interface Look { ground: number[]; a: number[]; b: number[]; c: number[]; dark: number; gain: number; toe: number }

/** A solver: WebGL2 (webgl.ts) or WebGPU (webgpu.ts). */
export interface Backend {
  readonly path: string
  readonly renderer: string
  /** Grid rows on a wide screen and on a phone. */
  readonly rows: readonly [number, number]
  /** The largest canvas backing size it can draw to, where that is below what screens need. */
  readonly maxSize?: number
  /** GPU time of one step in ms, where a step only encodes on the CPU (WebGPU). */
  readonly stepCost?: number
  resize(simW: number, simH: number, dyeW: number, dyeH: number): void
  mask(src: HTMLCanvasElement): void
  step(s: StepInput): void
  draw(look: Look): void
}

// Ink colours. Light: absorption per RGB channel. Dark: emitted light.
const LOOK: Record<Theme, Look> = {
  light: { ground: [0.914, 0.937, 0.949], a: [2.81, 1.43, 0.13], b: [0.0, 1.02, 2.66], c: [0.0, 0.22, 2.53], dark: 0, gain: P.gain, toe: P.toe },
  dark: { ground: [0.047, 0.059, 0.086], a: [0.22, 0.45, 1.25], b: [1.25, 0.46, 0.1], c: [1.15, 0.86, 0.22], dark: 1, gain: P.gain, toe: P.toe },
}
const INK_RGB: Record<InkId, number[]> = { 0: [1, 0, 0], 1: [0, 1, 0], 2: [0, 0, 1] }

// How long WebGPU may take to start before WebGL2 takes the canvas instead. The pages wait
// this long at most before the pour; a cold start took about 250 ms more than WebGL2 here.
const GPU_WAIT_MS = 1000

/**
 * Starts the ink on WebGPU where the browser gives a hardware adapter, otherwise on
 * WebGL2. Throws at once when neither API exists; `onFail` hears of a later failure.
 * `?ink=webgl2` or `?ink=webgpu` picks a path, the second even on a software adapter.
 */
export function createInk(canvas: HTMLCanvasElement, theme: Theme, onFail?: (err: Error) => void): Ink {
  const pick = new URLSearchParams(location.search).get('ink')

  const maskCanvas = document.createElement('canvas')
  const mctx = maskCanvas.getContext('2d', { willReadFrequently: false })!
  let be: Backend | null = null
  let simW = 0, simH = 0, dyeW = 0, dyeH = 0

  function resize() {
    if (!be) return
    const lim = be.maxSize ?? Infinity
    const dpr = Math.min(devicePixelRatio || 1, 2, lim / Math.max(innerWidth, innerHeight))
    canvas.width = Math.min(lim, Math.round(innerWidth * dpr)); canvas.height = Math.min(lim, Math.round(innerHeight * dpr))
    const rows = be.rows[innerWidth <= 700 ? 1 : 0]
    simH = rows; simW = Math.max(16, Math.round(rows * innerWidth / innerHeight))
    const dyeScale = Math.min(1, 1100 / Math.max(innerWidth, innerHeight))
    dyeW = Math.round(innerWidth * dyeScale); dyeH = Math.round(innerHeight * dyeScale)
    maskCanvas.width = dyeW; maskCanvas.height = dyeH
    be.resize(simW, simH, dyeW, dyeH)
    maskDirty = true
  }

  let emitters: Emitter[] = []
  let maskDirty = true

  // Input gathered between steps.
  const ptr = { x: -1, y: -1, ax: 0, ay: 0 }
  interface Burst { a: number[]; b: number[]; c: number[]; left: number }
  const waiting: Burst[] = [], active: Burst[] = []
  const bA = new Float32Array(16), bB = new Float32Array(16), bC = new Float32Array(16)
  let scrollV = 0
  let time = 0

  function step(dt: number) {
    if (!be) return
    if (maskDirty) {
      drawMask(mctx, dyeW, dyeH, emitters, Math.max(5, 9 * dyeH / innerHeight * (innerHeight / 900)))
      be.mask(maskCanvas); maskDirty = false
    }
    const ptrV: [number, number] = [ptr.ax * 9, ptr.ay * 9]; ptr.ax = 0; ptr.ay = 0
    while (active.length < 4 && waiting.length) active.push(waiting.shift()!)
    bA.fill(0); bB.fill(0); bC.fill(0)
    active.forEach((q, i) => { bA.set(q.a, i * 4); bB.set(q.b, i * 4); bC.set(q.c, i * 4); q.c = [q.c[0], q.c[1], q.c[2], 0] })
    be.step({
      p: P, dt, time, conf: P.conf * simH / 256, decay: Math.pow(P.decay, dt * 60), scroll: scrollV,
      asp: [simW / simH, 1], T: [1 / simW, 1 / simH], ptr: [ptr.x, ptr.y], ptrV, bA, bB, bC,
    })
    scrollV *= 0.5
    for (let i = active.length - 1; i >= 0; i--) if (--active[i].left <= 0) active.splice(i, 1)
    time += dt
  }

  let look = LOOK[theme]
  const draw = () => { try { be?.draw(look) } catch (err) { crash(err as Error) } }

  // Frame loop. One solver step per frame at a fixed 1/60 s, so the motion
  // looks the same on 60 Hz and 120 Hz screens; the step time is wall clock.
  let running = false, raf = 0, last = 0, fps = 60, stepMs = 0
  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    const gap = now - last; last = now
    if (gap > 0 && gap < 500) fps += (1000 / gap - fps) * 0.05
    const t0 = performance.now()
    try { step(1 / 60) } catch (err) { return crash(err as Error) }
    draw()
    stepMs += (performance.now() - t0 - stepMs) * 0.05
  }

  addEventListener('pointermove', (e) => {
    if (ptr.x >= 0) { ptr.ax += e.movementX / innerHeight; ptr.ay -= e.movementY / innerHeight }
    ptr.x = e.clientX / innerWidth; ptr.y = 1 - e.clientY / innerHeight
  }, { passive: true })
  let lastScroll = scrollY
  addEventListener('scroll', () => {
    const d = scrollY - lastScroll; lastScroll = scrollY
    scrollV = Math.max(-0.08, Math.min(0.08, scrollV + d * 0.0012))
    maskDirty = true
  }, { passive: true })
  let rz = 0
  addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { resize(); if (!running) draw() }) })
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (wanted) start() })

  let wanted = false, live = false
  function start() { if (running || !live) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame) }
  function stop() { running = false; cancelAnimationFrame(raf) }

  // Choosing a solver. Calls made before one is ready are kept: emitters, bursts and
  // the pointer in the state above, a preroll here, running in `wanted`.
  let pending: [number, number] | null = null
  let settle!: () => void
  const ready = new Promise<void>((r) => { settle = r })
  function preroll(steps: number, budgetMs: number) {
    if (!live) { pending = [steps, budgetMs]; return 0 }
    // On WebGPU the loop below only times the encoding, so the measured GPU cost caps the count.
    if (be?.stepCost) steps = Math.min(steps, Math.max(1, Math.floor(budgetMs / be.stepCost)))
    const t0 = performance.now(); let n = 0
    try {
      while (n < steps && performance.now() - t0 < budgetMs) { step(1 / 60); n++ }
    } catch (err) { crash(err as Error); return n }
    draw(); return n
  }
  function begin() {
    live = true
    if (pending) preroll(...pending)
    pending = null
    if (wanted && !document.hidden) start(); else draw()
    settle()
  }
  function useGL() {
    be = createWebGL(canvas, stop)
    resize(); begin()
  }
  function failed(err: Error) {
    stop(); be = null; live = false
    console.info('Ink is off:', err.message)
    onFail?.(err); settle()
  }

  let gave = false, gpu: GPUBackend | null = null
  const toGL = (why: string) => {
    if (gave) return
    gave = true
    console.info(`Ink on WebGL2: ${why}`)
    try { useGL() } catch (err) { failed(err as Error) }
  }
  // WebGPU failing mid-run (a lost device, a throw, repeated GPU errors) hands over to WebGL2
  // on a fresh canvas: a canvas keeps the first API it was given. Only the running WebGPU
  // path does this, so a late loss cannot tear down a WebGL2 path that already won.
  const lost = (why: string) => {
    if (!gpu || be !== gpu) return
    stop(); be = null; live = false; gpu.abandon()
    const fresh = canvas.cloneNode() as HTMLCanvasElement
    canvas.replaceWith(fresh); canvas = fresh
    gave = false; toGL(why)
  }
  // A throw from a step or a draw: the frame loop would keep going with a solver that never moves.
  function crash(err: Error) {
    if (gpu && be === gpu) return lost(`WebGPU failed: ${err.message}`)
    failed(err)
  }

  if (pick === 'webgl2' || !('gpu' in navigator)) useGL()
  else {
    const timer = setTimeout(() => toGL('WebGPU took too long to start'), GPU_WAIT_MS)
    // The first step runs on the real grid before the canvas is handed over, so a
    // WebGPU path that fails its first frame never draws.
    createWebGPU(canvas, pick === 'webgpu', lost).then(async (b) => {
      gpu = b
      if (gave) return gpu.abandon()
      be = gpu; resize(); step(1 / 60)
      await gpu.commit(look)
      if (gave) { if (be === gpu) be = null; return gpu.abandon() }
      clearTimeout(timer); gave = true
      begin()
    }).catch((err: Error) => {
      clearTimeout(timer)
      if (gpu && be === gpu) be = null
      gpu?.abandon()
      toGL(err.message)
    })
  }

  return {
    ready,
    invalidate() { maskDirty = true },
    setEmitters(list) { emitters = list; maskDirty = true },
    burst(x, y, ink, amount = 1, rx = 57, ry = rx, { dir = [0, 0], spread = 1, steps = 1 } = {}) {
      if (waiting.length >= 24) return
      waiting.push({
        a: [x / innerWidth, 1 - y / innerHeight, rx / innerHeight, ry / innerHeight],
        b: [dir[0], -dir[1], spread, 0.9 * amount],
        c: [...INK_RGB[ink], 1.4 * amount],
        left: steps,
      })
    },
    stir(x, y, dx, dy) { ptr.x = x / innerWidth; ptr.y = 1 - y / innerHeight; ptr.ax += dx / innerHeight; ptr.ay -= dy / innerHeight },
    setTheme(t) { look = LOOK[t]; if (!running) draw() },
    setRunning(on) { wanted = on; if (on && !document.hidden) start(); else { stop(); draw() } },
    preroll,
    info: () => ({ path: be?.path ?? '…', renderer: be?.renderer ?? '', grid: be ? `${simW} × ${simH}` : '…', stepMs, fps, running }),
  }
}
