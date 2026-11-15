// Stable fluids (Stam 1999) in WebGL2 fragment shaders.
// Every pass draws one full-screen triangle into a float texture.
//
// The mask texture is drawn from the page itself (see mask.ts):
//   R  solid: the fluid flows around it and no ink is drawn there
//   G  emitter strength: ink enters here and is pushed downward
//   B  which ink an emitter holds, as B / G: 0 brick, 0.5 amber, 1 plum

const HEAD = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 uv; out vec4 o;
`

const SOLID = `
uniform sampler2D uMask;
float solid(vec2 p) { return (p.x < 0. || p.x > 1. || p.y < 0. || p.y > 1.) ? 1. : step(.5, texture(uMask, p).r); }
`

const NOISE = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
`

export const VERTEX = `#version 300 es
in vec2 a; out vec2 uv;
void main() { uv = a * .5 + .5; gl_Position = vec4(a, 0., 1.); }`

export const FRAGMENTS = {
  advect: HEAD + `
uniform sampler2D uVel, uMask; uniform vec2 uAsp; uniform float uDt, uDamp;
void main() {
  if (texture(uMask, uv).r > .5) { o = vec4(0.); return; }
  vec2 v = texture(uVel, uv).xy;
  o = vec4(texture(uVel, uv - uDt * v / uAsp).xy * uDamp, 0., 1.);
}`,

  curl: HEAD + `
uniform sampler2D uVel; uniform vec2 uT;
void main() {
  float L = texture(uVel, uv - vec2(uT.x, 0.)).y, R = texture(uVel, uv + vec2(uT.x, 0.)).y;
  float B = texture(uVel, uv - vec2(0., uT.y)).x, T = texture(uVel, uv + vec2(0., uT.y)).x;
  o = vec4(.5 * (R - L - T + B), 0., 0., 1.);
}`,

  // Vorticity confinement, buoyancy (ink is denser than water), a slow slosh,
  // the pointer, one radial burst, the push under each emitter and scroll drag.
  force: HEAD + `
uniform sampler2D uVel, uCurl, uDye, uMask;
uniform vec2 uT, uAsp, uPtr, uPtrV; uniform float uDt, uTime, uGrav, uConf, uPtrR, uSway, uPush, uScroll;
// Up to four bursts at once. A: centre x, y and radii (uv). B: push direction x, y, outward spread, strength.
uniform vec4 uBurstA[4], uBurstB[4];
void main() {
  vec4 m = texture(uMask, uv);
  if (m.r > .5) { o = vec4(0.); return; }
  vec2 v = texture(uVel, uv).xy;
  float L = abs(texture(uCurl, uv - vec2(uT.x, 0.)).x), R = abs(texture(uCurl, uv + vec2(uT.x, 0.)).x);
  float B = abs(texture(uCurl, uv - vec2(0., uT.y)).x), T = abs(texture(uCurl, uv + vec2(0., uT.y)).x);
  float C = texture(uCurl, uv).x;
  vec2 f = .5 * vec2(T - B, R - L); f /= length(f) + 1e-4; f *= uConf * C; f.y = -f.y;
  v += f * uDt;
  vec3 d = texture(uDye, uv).rgb;
  v.y -= uGrav * (d.r + d.g + d.b) * uDt;
  v.x += uSway * sin(uTime * .21 + uv.y * 5.) * uDt;
  v.y -= m.g * uPush * uDt;
  v.y += uScroll;
  vec2 q = (uv - uPtr) * uAsp;
  v += uPtrV * exp(-dot(q, q) / uPtrR);
  for (int i = 0; i < 4; i++) {
    vec4 A = uBurstA[i], Bq = uBurstB[i];
    if (Bq.w == 0.) continue;
    vec2 b = (uv - A.xy) * uAsp, bn = b / A.zw;
    v += Bq.w * (Bq.z * b / (length(b) + .02) + Bq.xy) * exp(-dot(bn, bn));
  }
  float s = length(v); if (s > 2.5) v *= 2.5 / s;
  o = vec4(v, 0., 1.);
}`,

  divergence: HEAD + SOLID + `
uniform sampler2D uVel; uniform vec2 uT;
void main() {
  vec2 l = uv - vec2(uT.x, 0.), r = uv + vec2(uT.x, 0.), b = uv - vec2(0., uT.y), t = uv + vec2(0., uT.y);
  float L = solid(l) > .5 ? 0. : texture(uVel, l).x, R = solid(r) > .5 ? 0. : texture(uVel, r).x;
  float B = solid(b) > .5 ? 0. : texture(uVel, b).y, T = solid(t) > .5 ? 0. : texture(uVel, t).y;
  o = vec4(.5 * (R - L + T - B), 0., 0., 1.);
}`,

  pressure: HEAD + SOLID + `
uniform sampler2D uP, uDiv; uniform vec2 uT; uniform float uKeep;
void main() {
  vec2 l = uv - vec2(uT.x, 0.), r = uv + vec2(uT.x, 0.), b = uv - vec2(0., uT.y), t = uv + vec2(0., uT.y);
  float C = texture(uP, uv).x;
  float L = solid(l) > .5 ? C : texture(uP, l).x, R = solid(r) > .5 ? C : texture(uP, r).x;
  float B = solid(b) > .5 ? C : texture(uP, b).x, T = solid(t) > .5 ? C : texture(uP, t).x;
  o = vec4((L + R + B + T) * uKeep * .25 - texture(uDiv, uv).x * .25, 0., 0., 1.);
}`,

  gradient: HEAD + SOLID + `
uniform sampler2D uP, uVel; uniform vec2 uT;
void main() {
  if (solid(uv) > .5) { o = vec4(0.); return; }
  vec2 l = uv - vec2(uT.x, 0.), r = uv + vec2(uT.x, 0.), b = uv - vec2(0., uT.y), t = uv + vec2(0., uT.y);
  float sL = solid(l), sR = solid(r), sB = solid(b), sT = solid(t), C = texture(uP, uv).x;
  float L = sL > .5 ? C : texture(uP, l).x, R = sR > .5 ? C : texture(uP, r).x;
  float B = sB > .5 ? C : texture(uP, b).x, T = sT > .5 ? C : texture(uP, t).x;
  vec2 v = texture(uVel, uv).xy - .5 * vec2(R - L, T - B);
  if (sL > .5 && v.x < 0.) v.x = 0.; if (sR > .5 && v.x > 0.) v.x = 0.;
  if (sB > .5 && v.y < 0.) v.y = 0.; if (sT > .5 && v.y > 0.) v.y = 0.;
  o = vec4(v, 0., 1.);
}`,

  // Ink: carried by the water, fading slowly, drained along the bottom edge,
  // fed in pulses under each emitter, and dropped by a burst.
  dye: HEAD + NOISE + `
uniform sampler2D uDye, uVel, uMask;
uniform vec2 uAsp; uniform float uDt, uDecay, uTime, uRate, uCap;
// A: centre and radii as in the force pass. C: the ink (rgb) and how much drops (a).
uniform vec4 uBurstA[4], uBurstC[4];
void main() {
  vec4 m = texture(uMask, uv);
  if (m.r > .5) { o = vec4(0., 0., 0., 1.); return; }
  vec2 v = texture(uVel, uv).xy;
  vec3 d = texture(uDye, uv - uDt * v / uAsp).rgb * uDecay;
  d *= 1. - .06 * smoothstep(.035, 0., uv.y);
  if (m.g > .02) {
    float pulse = .2 + smoothstep(.34, .7, vn(vec2(uv.x * uAsp.x * 7., uTime * .22)));
    float id = clamp(2. * m.b / m.g, 0., 2.);
    vec3 w = vec3(1. - min(id, 1.), 1. - abs(id - 1.), max(id - 1., 0.));
    d += m.g * pulse * uRate * uDt * w * max(0., 1. - (d.r + d.g + d.b) / uCap);
  }
  for (int i = 0; i < 4; i++) {
    if (uBurstC[i].a == 0.) continue;
    vec2 b = (uv - uBurstA[i].xy) * uAsp / (uBurstA[i].zw * .63);
    d += uBurstC[i].rgb * uBurstC[i].a * exp(-dot(b, b));
  }
  o = vec4(d, 1.);
}`,

  // The same Ember pigments in both themes; only the ground changes.
  show: HEAD + NOISE + `
uniform sampler2D uDye; uniform vec2 uDT;
uniform vec3 uGround, uA, uB, uC; uniform float uGain, uToe;
float tot(vec2 p) { vec3 d = texture(uDye, p).rgb; return d.r + d.g + d.b; }
void main() {
  vec3 d = texture(uDye, uv).rgb;
  d *= smoothstep(.01, uToe, d.r + d.g + d.b);
  vec2 e = uDT * 1.5;
  vec2 g = vec2(tot(uv + vec2(e.x, 0.)) - tot(uv - vec2(e.x, 0.)), tot(uv + vec2(0., e.y)) - tot(uv - vec2(0., e.y)));
  float edge = smoothstep(.015, .45, length(g));
  vec2 px = gl_FragCoord.xy;
  float grain = .6 * vn(px * .9) + .4 * vn(px * .23);
  vec3 dd = d * uGain * (1. + .95 * edge) * (.86 + .28 * grain);
  float mass = dd.r + dd.g + dd.b;
  vec3 ink = (dd.r * uA + dd.g * uB + dd.b * uC) / max(mass, 1e-5);
  float opacity = 1. - exp(-mass * .85);
  vec3 col = mix(uGround, ink, opacity) * (.99 + .02 * grain);
  o = vec4(col, 1.);
}`,
} as const

export type PassName = keyof typeof FRAGMENTS
