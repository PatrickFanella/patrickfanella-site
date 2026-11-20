import { drawMask, type Emitter, type InkId } from './mask'
import {
  admitBursts, advanceBursts, canQueueBurst, canvasSize, finalSteps, gpuCappedSteps, gridSize, isResizeNoop,
  probeSteps, resizeKeep, stepsThatFit, stillRemake,
} from './schedule'
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

export interface Look { ground: number[]; a: number[]; b: number[]; c: number[]; gain: number; toe: number }

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
  /** Block until the GPU has run every step sent so far (WebGL2; WebGPU cannot wait on the main thread). */
  finish?(): void
  /**
   * Lay the grids out for a new viewport. `keep` is the new viewport size over the old one,
   * in CSS px: the velocity and ink already there are carried over, anchored at the top left,
   * so they stay where they were on screen. Without it the tank starts empty.
   */
  resize(simW: number, simH: number, dyeW: number, dyeH: number, keep?: [number, number]): void
  mask(src: HTMLCanvasElement): void
  step(s: StepInput): void
  draw(look: Look): void
}

// The owner's Ember palette: the same sRGB pigments over either theme's ground.
const EMBER = {
  a: [202 / 255, 81 / 255, 72 / 255],   // brick #CA5148
  b: [210 / 255, 149 / 255, 40 / 255],  // amber #D29528
  c: [128 / 255, 85 / 255, 170 / 255],  // plum #8055AA
}
const LOOK: Record<Theme, Look> = {
  light: { ground: [0.914, 0.937, 0.949], ...EMBER, gain: P.gain, toe: P.toe },
  dark: { ground: [16 / 255, 19 / 255, 30 / 255], ...EMBER, gain: P.gain, toe: P.toe },
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
  // The solver and viewport the grids were last laid out for.
  let sized: Backend | null = null, cssW = 0, cssH = 0

  // A phone resizes the window whenever its toolbar slides in or out during a touch scroll, so
  // this must not empty the tank: the solver carries its velocity and ink over to the new grids.
  // Returns whether the grids were laid out again. A viewport with no size (a hidden frame) is
  // left alone; `sized` stays behind `be` until one has a size, and nothing steps or draws until then.
  function resize() {
    if (!be || !innerWidth || !innerHeight) return false
    const { w: cw, h: ch } = canvasSize(innerWidth, innerHeight, devicePixelRatio, be.maxSize)
    const same = sized === be
    // Assigning a canvas its own size still clears it, so leave an unchanged one alone.
    if (isResizeNoop(same, [cw, ch], [canvas.width, canvas.height], [cssW, cssH], [innerWidth, innerHeight])) return false
    canvas.width = cw; canvas.height = ch
    ;({ simW, simH, dyeW, dyeH } = gridSize(innerWidth, innerHeight, be.rows))
    maskCanvas.width = dyeW; maskCanvas.height = dyeH
    be.resize(simW, simH, dyeW, dyeH, same ? resizeKeep(innerWidth, innerHeight, cssW, cssH) : undefined)
    sized = be; cssW = innerWidth; cssH = innerHeight
    maskDirty = true
    return true
  }

  let emitters: Emitter[] = []
  let maskDirty = true

  // Input gathered between steps.
  const ptr = { x: -1, y: -1, ax: 0, ay: 0 }
  interface Burst { a: number[]; b: number[]; c: number[]; left: number }
  let waiting: Burst[] = [], active: Burst[] = []
  const bA = new Float32Array(16), bB = new Float32Array(16), bC = new Float32Array(16)
  let scrollV = 0
  let time = 0

  function step(dt: number) {
    if (!be || sized !== be) return
    if (maskDirty) {
      drawMask(mctx, dyeW, dyeH, emitters, Math.max(5, 9 * dyeH / innerHeight * (innerHeight / 900)))
      be.mask(maskCanvas); maskDirty = false
    }
    const ptrV: [number, number] = [ptr.ax * 9, ptr.ay * 9]; ptr.ax = 0; ptr.ay = 0
    ;({ active, waiting } = admitBursts(active, waiting))
    bA.fill(0); bB.fill(0); bC.fill(0)
    active.forEach((q, i) => { bA.set(q.a, i * 4); bB.set(q.b, i * 4); bC.set(q.c, i * 4); q.c = [q.c[0], q.c[1], q.c[2], 0] })
    be.step({
      p: P, dt, time, conf: P.conf * simH / 256, decay: Math.pow(P.decay, dt * 60), scroll: scrollV,
      asp: [simW / simH, 1], T: [1 / simW, 1 / simH], ptr: [ptr.x, ptr.y], ptrV, bA, bB, bC,
    })
    scrollV *= 0.5
    active = advanceBursts(active)
    time += dt
  }

  let look = LOOK[theme]
  const draw = () => { try { if (be && sized === be) be.draw(look) } catch (err) { crash(err as Error) } }

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

  // With no viewport there is nowhere to stir or burst, and dividing by its size would put
  // NaN into the water for good.
  const noView = () => !innerWidth || !innerHeight
  addEventListener('pointermove', (e) => {
    if (noView()) return
    if (ptr.x >= 0) { ptr.ax += e.movementX / innerHeight; ptr.ay -= e.movementY / innerHeight }
    ptr.x = e.clientX / innerWidth; ptr.y = 1 - e.clientY / innerHeight
  }, { passive: true })
  let lastScroll = scrollY
  addEventListener('scroll', () => {
    const d = scrollY - lastScroll; lastScroll = scrollY
    scrollV = Math.max(-0.08, Math.min(0.08, scrollV + d * 0.0012))
    maskDirty = true
  }, { passive: true })
  // Sizing a canvas clears it, and this frame's draw may already have run, so draw again.
  let rz = 0, again = 0
  addEventListener('resize', () => {
    cancelAnimationFrame(rz)
    rz = requestAnimationFrame(() => {
      const first = sized !== be
      if (!resize()) return
      // A page that loaded with no viewport gets its start now.
      if (first && live) return begin()
      draw()
      // A still (reduced motion) is never stepped again, so the carried ink would keep the old
      // layout's letter gaps and new space would stay bare. Once the size settles and the page
      // has laid out, make the still again from an empty tank, as a load at this size would. A
      // toolbar showing or hiding keeps the carried still: anchored at the top, it stays aligned,
      // and a new frame on every scroll reads as the ink freezing and jumping.
      if (!still || wanted) return
      if (stillRemake(innerWidth, innerHeight, stillW, stillH)) {
        clearTimeout(again)
        again = window.setTimeout(() => {
          if (!still || wanted || !be || sized !== be) return
          be.resize(simW, simH, dyeW, dyeH); maskDirty = true
          preroll(...still)
        }, 200)
      }
    })
  })
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (wanted) start() })

  let wanted = false, live = false
  function start() { if (running || !live) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame) }
  function stop() { running = false; cancelAnimationFrame(raf) }

  // Choosing a solver. Calls made before one is ready are kept: emitters, bursts and
  // the pointer in the state above, a preroll here, running in `wanted`.
  let pending: [number, number] | null = null
  // The still the page asked for (reduced motion) and the viewport it was last made for.
  let still: [number, number] | null = null, stillW = 0, stillH = 0
  let settle!: () => void
  const ready = new Promise<void>((r) => { settle = r })
  // A step returns once its work is sent, long before the GPU has run it. Timing that alone let
  // SwiftShader queue all 240 steps of a 1.5 s preroll and then freeze the tab for 15 s or more.
  function preroll(steps: number, budgetMs: number) {
    still = [steps, budgetMs]
    if (!live || !be || sized !== be) { pending = [steps, budgetMs]; return 0 }
    stillW = innerWidth; stillH = innerHeight
    const b = be, finish = b.finish?.bind(b), t0 = performance.now(); let n = 0
    try {
      if (finish) {
        // Time real completion. Start from an idle GPU and run one step alone: it also uploads the
        // mask and wakes the GPU, so its cost only bounds the next batch. Then probe with up to 8
        // steps, enough to spread the readback's round trip. Send what the time left allows at the
        // probe's cost and return without waiting, so the main thread only waits for those 9 steps.
        // More readbacks would refine the count, but each drains the GPU and blocks the page.
        const timed = (k: number) => {
          const t = performance.now()
          for (let i = 0; i < k; i++) step(1 / 60)
          n += k; finish()
          const now = performance.now()
          return stepsThatFit(budgetMs, now - t0, k, now - t)
        }
        finish()
        let fits = timed(1)
        const probe = probeSteps(fits, steps - n)
        if (probe) fits = timed(probe)
        for (let k = finalSteps(steps - n, fits); k > 0; k--) { step(1 / 60); n++ }
      } else {
        // WebGPU cannot wait here, so the GPU cost it measured at start caps the count.
        if (b.stepCost) steps = gpuCappedSteps(steps, budgetMs, b.stepCost)
        while (n < steps && performance.now() - t0 < budgetMs) { step(1 / 60); n++ }
      }
    } catch (err) { crash(err as Error); return n }
    draw(); return n
  }
  function begin() {
    live = true
    // No viewport yet: the resize handler calls this again once there is one.
    if (sized !== be) return settle()
    if (pending) preroll(...pending)
    // A solver started again (after a lost context or device) makes the still the page asked for.
    else if (still && !wanted) preroll(...still)
    pending = null
    if (wanted && !document.hidden) start(); else draw()
    settle()
  }
  // A lost WebGL2 context stops the ink until the browser restores it; then the solver starts
  // again on the same canvas, running or as a new still. While lost nothing steps or draws, and
  // showing the tab again does not start the loop. The listeners go on once: only one canvas runs WebGL2.
  let glWatched = false
  async function useGL() {
    if (!glWatched) {
      glWatched = true
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); be = sized = null; live = false })
      canvas.addEventListener('webglcontextrestored', () => { be = sized = null; void useGL().catch((err: Error) => failed(err)) })
    }
    be = await createWebGL(canvas)
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
    void useGL().catch((err: Error) => failed(err))
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

  if (pick === 'webgl2' || !('gpu' in navigator)) void useGL().catch((err: Error) => failed(err))
  else {
    const timer = setTimeout(() => toGL('WebGPU took too long to start'), GPU_WAIT_MS)
    // The first step runs on the real grid before the canvas is handed over, so a
    // WebGPU path that fails its first frame never draws.
    createWebGPU(canvas, pick === 'webgpu', lost).then(async (b) => {
      gpu = b
      if (gave) return gpu.abandon()
      be = gpu; resize()
      if (sized !== be) throw new Error('no viewport yet')
      step(1 / 60)
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
      if (!canQueueBurst(waiting.length) || noView()) return
      waiting.push({
        a: [x / innerWidth, 1 - y / innerHeight, rx / innerHeight, ry / innerHeight],
        b: [dir[0], -dir[1], spread, 0.9 * amount],
        c: [...INK_RGB[ink], 1.4 * amount],
        left: steps,
      })
    },
    stir(x, y, dx, dy) { if (noView()) return; ptr.x = x / innerWidth; ptr.y = 1 - y / innerHeight; ptr.ax += dx / innerHeight; ptr.ay -= dy / innerHeight },
    setTheme(t) { look = LOOK[t]; if (!running) draw() },
    setRunning(on) { wanted = on; if (on && !document.hidden) start(); else { stop(); draw() } },
    preroll,
    info: () => ({ path: be?.path ?? '…', renderer: be?.renderer ?? '', grid: be ? `${simW} × ${simH}` : '…', stepMs, fps, running }),
  }
}
