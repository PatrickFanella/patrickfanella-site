// The WebGPU solver: compute shaders (wgsl.ts) on a finer grid, used where the browser
// gives a hardware adapter. On an AMD Radeon iGPU, a step of the 512 × 320 grid here took
// 4.5 ms against 5.8 ms for the 410 × 256 grid on WebGL2 (timed to a forced readback). Nothing here touches the canvas until the first frame has
// run cleanly offscreen, so a failure still leaves the canvas free for WebGL2.
import { COMPUTE, SHOW, type ComputeName } from './wgsl'
import type { Backend, Look, StepInput } from './engine'

export interface GPUBackend extends Backend {
  /** Draw the first frame offscreen and check every pass ran; then take the canvas. */
  commit(look: Look): Promise<void>
  /** Give up the device, such as when WebGL2 took over while this was starting. */
  abandon(): void
}

const SOFT = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|warp/i

// Core first, then the compatibility feature level (WebGPU over OpenGL ES, as on many
// Linux machines). A software adapter only counts when `soft` asks for one: the WebGL2
// path on real hardware beats a CPU emulating WebGPU.
async function pickAdapter(soft: boolean) {
  let fallback: GPUAdapter | null = null
  for (const o of [{ powerPreference: 'high-performance' }, { featureLevel: 'compatibility', powerPreference: 'high-performance' }] as GPURequestAdapterOptions[]) {
    const a = await navigator.gpu.requestAdapter(o).catch(() => null)
    if (!a) continue
    const i = a.info
    if (!i.isFallbackAdapter && !SOFT.test(`${i.vendor} ${i.architecture} ${i.device} ${i.description}`)) return { a, soft: false }
    fallback ??= a
  }
  return soft && fallback ? { a: fallback, soft: true } : null
}

// Chrome leaves most adapter fields blank; the WebGL renderer string names the same GPU in words.
function glRenderer() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return ''
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const name = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return name
  } catch { return '' }
}

interface Res { id: number; r: GPUBindingResource }
interface Tex extends Res { t: GPUTexture }
interface Two { r: Tex; w: Tex; swap(): void }

// Uncaptured GPU errors after the start that end the WebGPU run. One can be a fluke;
// by the third, passes are failing and the frame is not being drawn.
const MAX_ERRORS = 3

export async function createWebGPU(canvas: HTMLCanvasElement, soft: boolean, onLost: (why: string) => void): Promise<GPUBackend> {
  const pick = await pickAdapter(soft)
  if (!pick) throw new Error(soft ? 'No WebGPU adapter' : 'No hardware WebGPU adapter')
  // The default limit is 8192 on core and 4096 at the compatibility level; ask for all the
  // adapter has, since the canvas backing store must fit in one texture.
  const device = await pick.a.requestDevice({ requiredLimits: { maxTextureDimension2D: pick.a.limits.maxTextureDimension2D } })
  device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation')
  let live = true
  device.lost.then((info) => { if (live && info.reason !== 'destroyed') { live = false; onLost('the WebGPU device was lost') } })

  const pipes = {} as Record<ComputeName, GPUComputePipeline>
  const showModule = device.createShaderModule({ code: SHOW, label: 'show' })
  const format = navigator.gpu.getPreferredCanvasFormat()
  const [show] = await Promise.all([
    device.createRenderPipelineAsync({
      label: 'show', layout: 'auto', primitive: { topology: 'triangle-list' },
      vertex: { module: showModule, entryPoint: 'vs' }, fragment: { module: showModule, entryPoint: 'fs', targets: [{ format }] },
    }),
    ...(Object.keys(COMPUTE) as ComputeName[]).map(async (k) => {
      pipes[k] = await device.createComputePipelineAsync({ label: k, layout: 'auto', compute: { module: device.createShaderModule({ code: COMPUTE[k], label: k }), entryPoint: 'main' } })
    }),
  ]).catch((err) => { live = false; device.destroy(); throw err })

  let ids = 0
  const wrap = (r: GPUBindingResource): Res => ({ id: ++ids, r })
  const buffer = (size: number) => device.createBuffer({ size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const samp = wrap(device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' }))
  const ubuf = buffer(272), sbuf = buffer(96)
  const u = wrap({ buffer: ubuf }), sres = wrap({ buffer: sbuf })
  const ud = new Float32Array(68), sd = new Float32Array(24)
  const keep = (k: number) => { const b = buffer(16); device.queue.writeBuffer(b, 0, new Float32Array([k, 0, 0, 0])); return wrap({ buffer: b }) }
  // The first sweep warm-starts from the last step's pressure, damped, as on WebGL2.
  const keep0 = keep(0.9), keep1 = keep(1)

  let owned: GPUTexture[] = []
  const RW = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
  const tex = (w: number, h: number, f: GPUTextureFormat, usage = RW): Tex => {
    const t = device.createTexture({ size: [w, h], format: f, usage }); owned.push(t)
    return { ...wrap(t.createView()), t }
  }
  const two = (w: number, h: number, f: GPUTextureFormat): Two => {
    const o = { r: tex(w, h, f), w: tex(w, h, f), swap() { const t = o.r; o.r = o.w; o.w = t } }
    return o
  }

  let W = 0, H = 0, dyeW = 0, dyeH = 0
  // Some adapters (SwiftShader here) throw on every canvas upload; the CPU copy then takes over.
  let copyOk = true, flip: Uint8Array<ArrayBuffer> | null = null
  let last: StepInput | null = null, cost = 0
  let vel!: Two, prs!: Two, dye!: Two, curl!: Tex, divg!: Tex, solid!: Tex, mask!: Tex

  // Bind groups for each pass and set of textures. Ping-pong makes a handful per pass.
  const groups = new Map<string, GPUBindGroup>()
  function go(pass: GPUComputePassEncoder, name: ComputeName, res: Res[], w: number, h: number) {
    const p = pipes[name], key = name + res.map((r) => ':' + r.id).join('')
    let g = groups.get(key)
    if (!g) { g = device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: res.map((r, i) => ({ binding: i, resource: r.r })) }); groups.set(key, g) }
    pass.setPipeline(p); pass.setBindGroup(0, g); pass.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8))
  }

  let ctx: GPUCanvasContext | null = null
  function paint(view: GPUTextureView, l: Look) {
    sd.set([...l.ground, 0, ...l.a, 0, ...l.b, 0, ...l.c, 0, 1 / dyeW, 1 / dyeH, l.gain, l.toe])
    device.queue.writeBuffer(sbuf, 0, sd)
    const key = 'show:' + dye.r.id
    let g = groups.get(key)
    if (!g) { g = device.createBindGroup({ layout: show.getBindGroupLayout(0), entries: [sres, samp, dye.r].map((r, i) => ({ binding: i, resource: r.r })) }); groups.set(key, g) }
    const enc = device.createCommandEncoder()
    const pass = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] })
    pass.setPipeline(show); pass.setBindGroup(0, g); pass.draw(3); pass.end()
    device.queue.submit([enc.finish()])
  }

  const info = pick.a.info
  const renderer = (!pick.soft && glRenderer()) || info.description || [info.vendor, info.architecture].filter(Boolean).join(' ') || 'WebGPU adapter'

  const be: GPUBackend = {
    path: 'WebGPU compute',
    renderer,
    rows: [320, 250],
    resize(simW, simH, dW, dH) {
      for (const t of owned) t.destroy()
      owned = []; groups.clear()
      W = simW; H = simH; dyeW = dW; dyeH = dH
      vel = two(W, H, 'rgba16float'); dye = two(dyeW, dyeH, 'rgba16float'); prs = two(W, H, 'r32float')
      curl = tex(W, H, 'r32float'); divg = tex(W, H, 'r32float'); solid = tex(W, H, 'r32float')
      mask = tex(dyeW, dyeH, 'rgba8unorm', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT)
    },
    get stepCost() { return cost },
    maxSize: device.limits.maxTextureDimension2D,
    mask(src) {
      if (copyOk) {
        try { return device.queue.copyExternalImageToTexture({ source: src, flipY: true }, { texture: mask.t }, [dyeW, dyeH]) } catch { copyOk = false }
      }
      // Rows come top-down from the 2D canvas; the solver wants them bottom-up.
      const px = src.getContext('2d')!.getImageData(0, 0, dyeW, dyeH).data, row = dyeW * 4
      if (flip?.length !== px.length) flip = new Uint8Array(px.length)
      for (let y = 0; y < dyeH; y++) flip.set(px.subarray(y * row, y * row + row), (dyeH - 1 - y) * row)
      device.queue.writeTexture({ texture: mask.t }, flip, { bytesPerRow: row }, [dyeW, dyeH])
    },
    step(s: StepInput) {
      const { p } = s
      last = s
      ud.set([...s.asp, ...s.T, ...s.ptr, ...s.ptrV, s.dt, s.time, p.grav, s.conf, p.ptrR, p.sway, p.push, s.scroll, p.damp, s.decay, p.rate, p.cap])
      ud.set(s.bA, 20); ud.set(s.bB, 36); ud.set(s.bC, 52)
      device.queue.writeBuffer(ubuf, 0, ud)
      const enc = device.createCommandEncoder(), pass = enc.beginComputePass()
      go(pass, 'solid', [samp, mask, solid], W, H)
      go(pass, 'advect', [u, samp, vel.r, solid, vel.w], W, H); vel.swap()
      go(pass, 'curl', [vel.r, curl], W, H)
      go(pass, 'force', [u, samp, vel.r, curl, dye.r, mask, vel.w], W, H); vel.swap()
      go(pass, 'divergence', [vel.r, solid, divg], W, H)
      for (let i = 0; i < p.iters; i++) { go(pass, 'pressure', [i === 0 ? keep0 : keep1, prs.r, divg, solid, prs.w], W, H); prs.swap() }
      go(pass, 'gradient', [prs.r, vel.r, solid, vel.w], W, H); vel.swap()
      go(pass, 'dye', [u, samp, dye.r, vel.r, mask, dye.w], dyeW, dyeH); dye.swap()
      pass.end(); device.queue.submit([enc.finish()])
    },
    draw(l: Look) {
      if (ctx) paint(ctx.getCurrentTexture().createView(), l)
    },
    async commit(l: Look) {
      // The probe is the canvas's size, so a backing store over the texture limit fails here, not on the first frame.
      const probe = device.createTexture({ size: [canvas.width, canvas.height], format, usage: GPUTextureUsage.RENDER_ATTACHMENT })
      paint(probe.createView(), l)
      await device.queue.onSubmittedWorkDone()
      probe.destroy()
      // A step only encodes on the CPU, so time a few on the GPU itself for preroll's budget.
      if (last) {
        const z = new Float32Array(16), t0 = performance.now()
        for (let i = 0; i < 3; i++) be.step({ ...last, bA: z, bB: z, bC: z })
        await device.queue.onSubmittedWorkDone()
        cost = (performance.now() - t0) / 3
      }
      const bad = (await device.popErrorScope()) ?? (await device.popErrorScope())
      if (bad || !live) { live = false; device.destroy(); throw new Error(bad?.message ?? 'WebGPU device lost') }
      ctx = canvas.getContext('webgpu')
      if (!ctx) { live = false; device.destroy(); throw new Error('No WebGPU canvas context') }
      ctx.configure({ device, format, alphaMode: 'opaque' })
      let errors = 0
      device.addEventListener('uncapturederror', (e) => {
        const msg = (e as GPUUncapturedErrorEvent).error.message
        console.warn('WebGPU error:', msg)
        if (++errors === MAX_ERRORS && live) { live = false; onLost(`WebGPU errors: ${msg}`) }
      })
    },
    abandon() { live = false; device.destroy() },
  }
  return be
}
