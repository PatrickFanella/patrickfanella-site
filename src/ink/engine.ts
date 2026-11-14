import { FRAGMENTS, VERTEX, type PassName } from './shaders'
import { drawMask, type Emitter, type InkId } from './mask'

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

// Tunables, at a 256-row grid.
const P = {
  damp: 0.9994, decay: 0.9972, grav: 0.7, conf: 4, sway: 0.03, push: 1.6,
  rate: 28, cap: 2.6, gain: 2.1, toe: 0.4, iters: 28, ptrR: 0.0032,
}

// Ink colours. Light: absorption per RGB channel. Dark: emitted light.
const LOOK: Record<Theme, { ground: number[]; a: number[]; b: number[]; c: number[]; dark: number }> = {
  light: { ground: [0.914, 0.937, 0.949], a: [2.81, 1.43, 0.13], b: [0.0, 1.02, 2.66], c: [0.0, 0.22, 2.53], dark: 0 },
  dark: { ground: [0.047, 0.059, 0.086], a: [0.22, 0.45, 1.25], b: [1.25, 0.46, 0.1], c: [1.15, 0.86, 0.22], dark: 1 },
}
const INK_RGB: Record<InkId, number[]> = { 0: [1, 0, 0], 1: [0, 1, 0], 2: [0, 0, 1] }

interface Target { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }
interface Pair { r: Target; w: Target; swap(): void }
type Uniform = number | number[] | Float32Array | Target | { tex: WebGLTexture }

export function createInk(canvas: HTMLCanvasElement, theme: Theme): Ink {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false })
  if (!gl) throw new Error('WebGL2 is not available')
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) throw new Error('No float render targets')
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src); gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
    return s
  }
  const vs = compile(gl.VERTEX_SHADER, VERTEX)
  const progs = {} as Record<PassName, { p: WebGLProgram; u: Map<string, WebGLUniformLocation> }>
  for (const name of Object.keys(FRAGMENTS) as PassName[]) {
    const p = gl.createProgram()!
    gl.attachShader(p, vs); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FRAGMENTS[name]))
    gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link')
    const u = new Map<string, WebGLUniformLocation>()
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
      const info = gl.getActiveUniform(p, i)!
      u.set(info.name.replace(/\[0\]$/, ''), gl.getUniformLocation(p, info.name)!)
    }
    progs[name] = { p, u }
  }
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST)

  const owned: Target[] = []
  const target = (w: number, h: number, ifmt: number, fmt: number, filter: number): Target => {
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, gl.HALF_FLOAT, null)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT)
    const t = { tex, fbo, w, h }; owned.push(t); return t
  }
  const pair = (w: number, h: number, ifmt: number, fmt: number, filter: number): Pair => {
    const o = { r: target(w, h, ifmt, fmt, filter), w: target(w, h, ifmt, fmt, filter), swap() { const t = o.r; o.r = o.w; o.w = t } }
    return o
  }

  const maskTex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, maskTex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const mask = { tex: maskTex }
  const maskCanvas = document.createElement('canvas')
  const mctx = maskCanvas.getContext('2d', { willReadFrequently: false })!

  let simW = 0, simH = 0, dyeW = 0, dyeH = 0
  let vel!: Pair, prs!: Pair, dye!: Pair, curl!: Target, divg!: Target

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr)
    const rows = innerWidth <= 700 ? 200 : 256
    simH = rows; simW = Math.max(16, Math.round(rows * innerWidth / innerHeight))
    const dyeScale = Math.min(1, 1100 / Math.max(innerWidth, innerHeight))
    dyeW = Math.round(innerWidth * dyeScale); dyeH = Math.round(innerHeight * dyeScale)
    for (const t of owned.splice(0)) { gl!.deleteTexture(t.tex); gl!.deleteFramebuffer(t.fbo) }
    vel = pair(simW, simH, gl!.RG16F, gl!.RG, gl!.LINEAR)
    prs = pair(simW, simH, gl!.R16F, gl!.RED, gl!.NEAREST)
    curl = target(simW, simH, gl!.R16F, gl!.RED, gl!.NEAREST)
    divg = target(simW, simH, gl!.R16F, gl!.RED, gl!.NEAREST)
    dye = pair(dyeW, dyeH, gl!.RGBA16F, gl!.RGBA, gl!.LINEAR)
    maskCanvas.width = dyeW; maskCanvas.height = dyeH
    maskDirty = true
  }

  let emitters: Emitter[] = []
  let maskDirty = true
  function uploadMask() {
    drawMask(mctx, dyeW, dyeH, emitters, Math.max(5, 9 * dyeH / innerHeight * (innerHeight / 900)))
    gl!.bindTexture(gl!.TEXTURE_2D, maskTex)
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true)
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, maskCanvas)
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, false)
    maskDirty = false
  }

  function run(name: PassName, uniforms: Record<string, Uniform>, out: Target | null) {
    const pr = progs[name]
    gl!.useProgram(pr.p)
    let unit = 0
    for (const [k, v] of Object.entries(uniforms)) {
      const loc = pr.u.get(k); if (!loc) continue
      if (typeof v === 'number') gl!.uniform1f(loc, v)
      else if (v instanceof Float32Array) gl!.uniform4fv(loc, v)
      else if (Array.isArray(v)) { if (v.length === 2) gl!.uniform2f(loc, v[0], v[1]); else gl!.uniform3f(loc, v[0], v[1], v[2]) }
      else { gl!.activeTexture(gl!.TEXTURE0 + unit); gl!.bindTexture(gl!.TEXTURE_2D, v.tex); gl!.uniform1i(loc, unit++) }
    }
    if (out) { gl!.bindFramebuffer(gl!.FRAMEBUFFER, out.fbo); gl!.viewport(0, 0, out.w, out.h) }
    else { gl!.bindFramebuffer(gl!.FRAMEBUFFER, null); gl!.viewport(0, 0, canvas.width, canvas.height) }
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
  }

  // Input gathered between steps.
  const ptr = { x: -1, y: -1, ax: 0, ay: 0 }
  interface Burst { a: number[]; b: number[]; c: number[]; left: number }
  const waiting: Burst[] = [], active: Burst[] = []
  const bA = new Float32Array(16), bB = new Float32Array(16), bC = new Float32Array(16)
  let scrollV = 0
  let time = 0

  function step(dt: number) {
    if (maskDirty) uploadMask()
    const asp = [simW / simH, 1], T = [1 / simW, 1 / simH], scale = simH / 256
    const ptrV = [ptr.ax * 9, ptr.ay * 9]; ptr.ax = 0; ptr.ay = 0
    while (active.length < 4 && waiting.length) active.push(waiting.shift()!)
    bA.fill(0); bB.fill(0); bC.fill(0)
    active.forEach((q, i) => { bA.set(q.a, i * 4); bB.set(q.b, i * 4); bC.set(q.c, i * 4); q.c = [q.c[0], q.c[1], q.c[2], 0] })
    run('advect', { uVel: vel.r, uMask: mask, uAsp: asp, uDt: dt, uDamp: P.damp }, vel.w); vel.swap()
    run('curl', { uVel: vel.r, uT: T }, curl)
    run('force', {
      uVel: vel.r, uCurl: curl, uDye: dye.r, uMask: mask, uT: T, uAsp: asp, uPtr: [ptr.x, ptr.y], uPtrV: ptrV,
      uBurstA: bA, uBurstB: bB, uDt: dt, uTime: time, uGrav: P.grav, uConf: P.conf * scale,
      uPtrR: P.ptrR, uSway: P.sway, uPush: P.push, uScroll: scrollV,
    }, vel.w); vel.swap()
    scrollV *= 0.5
    run('divergence', { uVel: vel.r, uMask: mask, uT: T }, divg)
    for (let i = 0; i < P.iters; i++) { run('pressure', { uP: prs.r, uDiv: divg, uMask: mask, uT: T, uKeep: i === 0 ? 0.9 : 1 }, prs.w); prs.swap() }
    run('gradient', { uP: prs.r, uVel: vel.r, uMask: mask, uT: T }, vel.w); vel.swap()
    run('dye', {
      uDye: dye.r, uVel: vel.r, uMask: mask, uAsp: asp, uDt: dt, uDecay: Math.pow(P.decay, dt * 60), uTime: time,
      uRate: P.rate, uCap: P.cap, uBurstA: bA, uBurstC: bC,
    }, dye.w); dye.swap()
    for (let i = active.length - 1; i >= 0; i--) if (--active[i].left <= 0) active.splice(i, 1)
    time += dt
  }

  let look = LOOK[theme]
  function draw() {
    run('show', { uDye: dye.r, uDT: [1 / dyeW, 1 / dyeH], uGround: look.ground, uA: look.a, uB: look.b, uC: look.c, uDark: look.dark, uGain: P.gain, uToe: P.toe }, null)
  }

  // Frame loop. One solver step per frame at a fixed 1/60 s, so the motion
  // looks the same on 60 Hz and 120 Hz screens; the step time is wall clock.
  let running = false, raf = 0, last = 0, fps = 60, stepMs = 0
  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    const gap = now - last; last = now
    if (gap > 0 && gap < 500) fps += (1000 / gap - fps) * 0.05
    const t0 = performance.now()
    step(1 / 60)
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
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop() })

  let wanted = false
  function start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame) }
  function stop() { running = false; cancelAnimationFrame(raf) }

  resize()

  return {
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
    preroll(steps, budgetMs) {
      const t0 = performance.now(); let n = 0
      while (n < steps && performance.now() - t0 < budgetMs) { step(1 / 60); n++ }
      draw(); return n
    },
    info: () => ({ path: 'WebGL2', renderer, grid: `${simW} × ${simH}`, stepMs, fps, running }),
  }
}
