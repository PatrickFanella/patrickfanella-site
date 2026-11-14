// The WebGL2 solver: the fallback path, and the only one where WebGPU is missing.
import { FRAGMENTS, VERTEX, type PassName } from './shaders'
import type { Backend, Look, StepInput } from './engine'

interface Target { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }
interface Pair { r: Target; w: Target; swap(): void }
type Uniform = number | number[] | Float32Array | Target | { tex: WebGLTexture }

export function createWebGL(canvas: HTMLCanvasElement, onLost: () => void): Backend {
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

  let dyeW = 0, dyeH = 0
  let vel!: Pair, prs!: Pair, dye!: Pair, curl!: Target, divg!: Target
  const texel = new Float32Array(4)

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

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onLost() })

  return {
    path: 'WebGL2',
    renderer,
    rows: [256, 200],
    resize(simW, simH, dW, dH) {
      dyeW = dW; dyeH = dH
      for (const t of owned.splice(0)) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo) }
      vel = pair(simW, simH, gl.RG16F, gl.RG, gl.LINEAR)
      prs = pair(simW, simH, gl.R16F, gl.RED, gl.NEAREST)
      curl = target(simW, simH, gl.R16F, gl.RED, gl.NEAREST)
      divg = target(simW, simH, gl.R16F, gl.RED, gl.NEAREST)
      dye = pair(dyeW, dyeH, gl.RGBA16F, gl.RGBA, gl.LINEAR)
    },
    mask(src) {
      gl.bindTexture(gl.TEXTURE_2D, maskTex)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    },
    step(s: StepInput) {
      const { p, asp, T } = s
      run('advect', { uVel: vel.r, uMask: mask, uAsp: asp, uDt: s.dt, uDamp: p.damp }, vel.w); vel.swap()
      run('curl', { uVel: vel.r, uT: T }, curl)
      run('force', {
        uVel: vel.r, uCurl: curl, uDye: dye.r, uMask: mask, uT: T, uAsp: asp, uPtr: s.ptr, uPtrV: s.ptrV,
        uBurstA: s.bA, uBurstB: s.bB, uDt: s.dt, uTime: s.time, uGrav: p.grav, uConf: s.conf,
        uPtrR: p.ptrR, uSway: p.sway, uPush: p.push, uScroll: s.scroll,
      }, vel.w); vel.swap()
      run('divergence', { uVel: vel.r, uMask: mask, uT: T }, divg)
      for (let i = 0; i < p.iters; i++) { run('pressure', { uP: prs.r, uDiv: divg, uMask: mask, uT: T, uKeep: i === 0 ? 0.9 : 1 }, prs.w); prs.swap() }
      run('gradient', { uP: prs.r, uVel: vel.r, uMask: mask, uT: T }, vel.w); vel.swap()
      run('dye', {
        uDye: dye.r, uVel: vel.r, uMask: mask, uAsp: asp, uDt: s.dt, uDecay: s.decay, uTime: s.time,
        uRate: p.rate, uCap: p.cap, uBurstA: s.bA, uBurstC: s.bC,
      }, dye.w); dye.swap()
    },
    // Reading one texel back makes the GPU run everything before it. A fence would not do:
    // WebGL only updates its status between tasks, so it cannot be waited on inside one.
    finish() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dye.r.fbo)
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, texel)
    },
    draw(l: Look) {
      run('show', { uDye: dye.r, uDT: [1 / dyeW, 1 / dyeH], uGround: l.ground, uA: l.a, uB: l.b, uC: l.c, uDark: l.dark, uGain: l.gain, uToe: l.toe }, null)
    },
  }
}
