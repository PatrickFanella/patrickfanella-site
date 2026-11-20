// The same stable fluids as shaders.ts, as WebGPU compute shaders that write storage
// textures. Every pass reads and writes whole cells, with row 0 at the bottom as in WebGL.
//
// The mask is the same texture as on WebGL2 (see mask.ts), at dye resolution:
//   R  solid   G  emitter strength   B  which ink, as B / G
// One pass turns it into a solid map each step, so the Jacobi sweeps read one
// float instead of filtering the mask.
//
// Pressure uses the same warm-started Jacobi sweeps as WebGL2. A two-grid solve
// (docs/prototypes/desk/ink-bg.html) is cheaper, but it makes the water so nearly
// incompressible that the ink hangs in swirls under the name instead of pouring.

// Step uniforms. Bursts: A centre and radii (uv), B push direction, spread and
// strength, C the ink (rgb) and how much drops (a). See engine.ts.
const U = `
struct U {
  asp: vec2f, T: vec2f, ptr: vec2f, ptrV: vec2f,
  dt: f32, time: f32, grav: f32, conf: f32,
  ptrR: f32, sway: f32, push: f32, scroll: f32,
  damp: f32, decay: f32, rate: f32, cap: f32,
  bA: array<vec4f, 4>, bB: array<vec4f, 4>, bC: array<vec4f, 4>,
};
`

const NOISE = `
fn h21(p0: vec2f) -> f32 { var p = fract(p0 * vec2f(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
fn vn(p: vec2f) -> f32 { let i = floor(p); var f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2f(1, 0)), f.x), mix(h21(i + vec2f(0, 1)), h21(i + vec2f(1, 1)), f.x), f.y); }
`

// Opens main(): c is this cell, d the grid size, uv the cell centre.
const MAIN = `
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(outT); if (gid.x >= dim.x || gid.y >= dim.y) { return; }
  let d = vec2i(dim); let c = vec2i(gid.xy); let uv = (vec2f(gid.xy) + .5) / vec2f(dim);
`

// Outside the grid counts as solid, as the WebGL2 solid() does.
const SOLID = `
fn sol(c: vec2i, d: vec2i) -> bool { if (any(c < vec2i(0)) || any(c >= d)) { return true; } return textureLoad(solidT, c, 0).r > .5; }
fn cl(c: vec2i, d: vec2i) -> vec2i { return clamp(c, vec2i(0), d - 1); }
`

const L4 = `let l = c + vec2i(-1, 0); let r = c + vec2i(1, 0); let b = c + vec2i(0, -1); let t = c + vec2i(0, 1);`

export const COMPUTE = {
  // The mask, sampled at each velocity cell as WebGL2 samples it.
  solid: `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var maskT: texture_2d<f32>;
@group(0) @binding(2) var outT: texture_storage_2d<r32float, write>;
` + MAIN + `
  textureStore(outT, c, vec4f(step(.5, textureSampleLevel(maskT, samp, uv, 0.).r), 0., 0., 1.));
}`,

  advect: U + `
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var velIn: texture_2d<f32>;
@group(0) @binding(3) var solidT: texture_2d<f32>;
@group(0) @binding(4) var outT: texture_storage_2d<rgba16float, write>;
` + MAIN + `
  if (textureLoad(solidT, c, 0).r > .5) { textureStore(outT, c, vec4f(0.)); return; }
  let v = textureLoad(velIn, c, 0).xy;
  textureStore(outT, c, vec4f(textureSampleLevel(velIn, samp, uv - u.dt * v / u.asp, 0.).xy * u.damp, 0., 1.));
}`,

  curl: `
@group(0) @binding(0) var velIn: texture_2d<f32>;
@group(0) @binding(1) var outT: texture_storage_2d<r32float, write>;
fn V(c: vec2i, d: vec2i) -> vec2f { return textureLoad(velIn, clamp(c, vec2i(0), d - 1), 0).xy; }
` + MAIN + `
  let L = V(c + vec2i(-1, 0), d).y; let R = V(c + vec2i(1, 0), d).y;
  let B = V(c + vec2i(0, -1), d).x; let T = V(c + vec2i(0, 1), d).x;
  textureStore(outT, c, vec4f(.5 * (R - L - T + B), 0., 0., 1.));
}`,

  // Vorticity confinement, buoyancy, the slosh, the pointer, up to four bursts,
  // the push under each emitter and scroll drag: the WebGL2 force pass line for line.
  force: U + `
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var velIn: texture_2d<f32>;
@group(0) @binding(3) var curlT: texture_2d<f32>;
@group(0) @binding(4) var dyeIn: texture_2d<f32>;
@group(0) @binding(5) var maskT: texture_2d<f32>;
@group(0) @binding(6) var outT: texture_storage_2d<rgba16float, write>;
fn K(c: vec2i, d: vec2i) -> f32 { return textureLoad(curlT, clamp(c, vec2i(0), d - 1), 0).r; }
` + MAIN + `
  let m = textureSampleLevel(maskT, samp, uv, 0.);
  if (m.r > .5) { textureStore(outT, c, vec4f(0.)); return; }
  var v = textureLoad(velIn, c, 0).xy;
  let L = abs(K(c + vec2i(-1, 0), d)); let R = abs(K(c + vec2i(1, 0), d));
  let B = abs(K(c + vec2i(0, -1), d)); let T = abs(K(c + vec2i(0, 1), d));
  var f = .5 * vec2f(T - B, R - L); f = f / (length(f) + 1e-4) * u.conf * K(c, d); f.y = -f.y;
  v += f * u.dt;
  let dd = textureSampleLevel(dyeIn, samp, uv, 0.).rgb;
  v.y -= u.grav * (dd.r + dd.g + dd.b) * u.dt;
  v.x += u.sway * sin(u.time * .21 + uv.y * 5.) * u.dt;
  v.y -= m.g * u.push * u.dt;
  v.y += u.scroll;
  let q = (uv - u.ptr) * u.asp;
  v += u.ptrV * exp(-dot(q, q) / u.ptrR);
  for (var i = 0; i < 4; i++) {
    let A = u.bA[i]; let Bq = u.bB[i];
    if (Bq.w == 0.) { continue; }
    let b = (uv - A.xy) * u.asp; let bn = b / A.zw;
    v += Bq.w * (Bq.z * b / (length(b) + .02) + Bq.xy) * exp(-dot(bn, bn));
  }
  let s = length(v); if (s > 2.5) { v *= 2.5 / s; }
  textureStore(outT, c, vec4f(v, 0., 1.));
}`,

  divergence: `
@group(0) @binding(0) var velIn: texture_2d<f32>;
@group(0) @binding(1) var solidT: texture_2d<f32>;
@group(0) @binding(2) var outT: texture_storage_2d<r32float, write>;
` + SOLID + MAIN + L4 + `
  let L = select(textureLoad(velIn, cl(l, d), 0).x, 0., sol(l, d)); let R = select(textureLoad(velIn, cl(r, d), 0).x, 0., sol(r, d));
  let B = select(textureLoad(velIn, cl(b, d), 0).y, 0., sol(b, d)); let T = select(textureLoad(velIn, cl(t, d), 0).y, 0., sol(t, d));
  textureStore(outT, c, vec4f(.5 * (R - L + T - B), 0., 0., 1.));
}`,

  // One Jacobi sweep; keep < 1 damps the warm start from the last step.
  pressure: `
struct J { keep: f32 };
@group(0) @binding(0) var<uniform> k: J;
@group(0) @binding(1) var pIn: texture_2d<f32>;
@group(0) @binding(2) var divT: texture_2d<f32>;
@group(0) @binding(3) var solidT: texture_2d<f32>;
@group(0) @binding(4) var outT: texture_storage_2d<r32float, write>;
` + SOLID + MAIN + L4 + `
  let C = textureLoad(pIn, c, 0).r;
  let L = select(textureLoad(pIn, cl(l, d), 0).r, C, sol(l, d)); let R = select(textureLoad(pIn, cl(r, d), 0).r, C, sol(r, d));
  let B = select(textureLoad(pIn, cl(b, d), 0).r, C, sol(b, d)); let T = select(textureLoad(pIn, cl(t, d), 0).r, C, sol(t, d));
  textureStore(outT, c, vec4f((L + R + B + T) * k.keep * .25 - textureLoad(divT, c, 0).r * .25, 0., 0., 1.));
}`,

  gradient: `
@group(0) @binding(0) var pIn: texture_2d<f32>;
@group(0) @binding(1) var velIn: texture_2d<f32>;
@group(0) @binding(2) var solidT: texture_2d<f32>;
@group(0) @binding(3) var outT: texture_storage_2d<rgba16float, write>;
` + SOLID + MAIN + `
  if (sol(c, d)) { textureStore(outT, c, vec4f(0.)); return; }
  ` + L4 + `
  let sL = sol(l, d); let sR = sol(r, d); let sB = sol(b, d); let sT = sol(t, d);
  let C = textureLoad(pIn, c, 0).r;
  let L = select(textureLoad(pIn, cl(l, d), 0).r, C, sL); let R = select(textureLoad(pIn, cl(r, d), 0).r, C, sR);
  let B = select(textureLoad(pIn, cl(b, d), 0).r, C, sB); let T = select(textureLoad(pIn, cl(t, d), 0).r, C, sT);
  var v = textureLoad(velIn, c, 0).xy - .5 * vec2f(R - L, T - B);
  if (sL && v.x < 0.) { v.x = 0.; } if (sR && v.x > 0.) { v.x = 0.; }
  if (sB && v.y < 0.) { v.y = 0.; } if (sT && v.y > 0.) { v.y = 0.; }
  textureStore(outT, c, vec4f(v, 0., 1.));
}`,

  // Ink: carried, fading, drained along the bottom, fed under each emitter, dropped by bursts.
  dye: U + NOISE + `
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var dyeIn: texture_2d<f32>;
@group(0) @binding(3) var velIn: texture_2d<f32>;
@group(0) @binding(4) var maskT: texture_2d<f32>;
@group(0) @binding(5) var outT: texture_storage_2d<rgba16float, write>;
` + MAIN + `
  let m = textureLoad(maskT, c, 0);
  if (m.r > .5) { textureStore(outT, c, vec4f(0., 0., 0., 1.)); return; }
  let v = textureSampleLevel(velIn, samp, uv, 0.).xy;
  var q = textureSampleLevel(dyeIn, samp, uv - u.dt * v / u.asp, 0.).rgb * u.decay;
  q *= 1. - .06 * (1. - smoothstep(0., .035, uv.y));
  if (m.g > .02) {
    let pulse = .2 + smoothstep(.34, .7, vn(vec2f(uv.x * u.asp.x * 7., u.time * .22)));
    let id = clamp(2. * m.b / m.g, 0., 2.);
    let w = vec3f(1. - min(id, 1.), 1. - abs(id - 1.), max(id - 1., 0.));
    q += m.g * pulse * u.rate * u.dt * w * max(0., 1. - (q.r + q.g + q.b) / u.cap);
  }
  for (var i = 0; i < 4; i++) {
    let C = u.bC[i];
    if (C.a == 0.) { continue; }
    let b = (uv - u.bA[i].xy) * u.asp / (u.bA[i].zw * .63);
    q += C.rgb * C.a * exp(-dot(b, b));
  }
  textureStore(outT, c, vec4f(q, 1.));
}`,
  // Carries velocity or ink over to a new grid when the viewport changes size, as on WebGL2:
  // the grids share their top left corner. k is the new size over the old (x, y) and a gain.
  resample: `
@group(0) @binding(0) var<uniform> k: vec4f;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var srcT: texture_2d<f32>;
@group(0) @binding(3) var outT: texture_storage_2d<rgba16float, write>;
` + MAIN + `
  let p = vec2f(uv.x * k.x, 1. - (1. - uv.y) * k.y);
  if (any(p < vec2f(0.)) || any(p > vec2f(1.))) { textureStore(outT, c, vec4f(0.)); return; }
  textureStore(outT, c, textureSampleLevel(srcT, samp, p, 0.) * k.z);
}`,
} as const

export type ComputeName = keyof typeof COMPUTE

// The same Ember pigments and compositing as the WebGL2 show pass in both themes.
export const SHOW = NOISE + `
struct S { ground: vec4f, a: vec4f, b: vec4f, c: vec4f, dT: vec2f, gain: f32, toe: f32 };
@group(0) @binding(0) var<uniform> s: S;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var dyeT: texture_2d<f32>;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2. - 1.;
  var o: VO; o.pos = vec4f(p, 0., 1.); o.uv = p * .5 + .5; return o;
}
fn tot(p: vec2f) -> f32 { let q = textureSampleLevel(dyeT, samp, p, 0.).rgb; return q.r + q.g + q.b; }
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let uv = i.uv;
  var d = textureSampleLevel(dyeT, samp, uv, 0.).rgb;
  d *= smoothstep(.01, s.toe, d.r + d.g + d.b);
  let e = s.dT * 1.5;
  let g = vec2f(tot(uv + vec2f(e.x, 0.)) - tot(uv - vec2f(e.x, 0.)), tot(uv + vec2f(0., e.y)) - tot(uv - vec2f(0., e.y)));
  let edge = smoothstep(.015, .45, length(g));
  let px = i.pos.xy;
  let grain = .6 * vn(px * .9) + .4 * vn(px * .23);
  let dd = d * s.gain * (1. + .95 * edge) * (.86 + .28 * grain);
  let mass = dd.r + dd.g + dd.b;
  let ink = (dd.r * s.a.rgb + dd.g * s.b.rgb + dd.b * s.c.rgb) / max(mass, 1e-5);
  let opacity = 1. - exp(-mass * .85);
  let col = mix(s.ground.rgb, ink, opacity) * (.99 + .02 * grain);
  return vec4f(col, 1.);
}`
