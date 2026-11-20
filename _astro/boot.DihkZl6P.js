var e={c:0,o:1,y:2};function t(t){return e[t??``]??0}function n(e,t,n){e.font=`${n.fontWeight} ${n.fontSize} ${n.fontFamily}`;let r=e.measureText(t),i=r.fontBoundingBoxAscent,a=r.fontBoundingBoxDescent;return((parseFloat(n.lineHeight)||i+a)-(i+a))/2+i}var r=null;function i(e){return r??=document.createElement(`canvas`).getContext(`2d`),e.getBoundingClientRect().top+n(r,e.textContent??``,getComputedStyle(e))}var a=(e,t)=>`rgb(0,${Math.round(255*t)},${Math.round(127.5*e*t)})`;function o(e,r,i,o,s=9){let c=r/innerWidth,l=i/innerHeight;e.setTransform(1,0,0,1,0,0),e.globalCompositeOperation=`source-over`,e.fillStyle=`#000`,e.fillRect(0,0,r,i),e.setTransform(c,0,0,l,0,0),e.fillStyle=`rgb(255,0,0)`;for(let t of document.querySelectorAll(`[data-ink-solid]`)){let n=t.getBoundingClientRect();n.bottom<0||n.top>innerHeight||e.fillRect(n.left,n.top,n.width,n.height)}for(let t of o){let n=t.rect;t.strength<=0||n.bottom<0||n.top>innerHeight||(e.fillStyle=a(t.ink,t.strength),e.fillRect(n.left+4,n.bottom,Math.max(0,n.width-8),s))}e.textBaseline=`alphabetic`;let u=[...document.querySelectorAll(`[data-ink-letter]`)],d=new Map(u.map(e=>[e,e.getBoundingClientRect()])),f=new Map;for(let e of u){let t=e.closest(`[data-pour-in]`);f.set(t,Math.max(f.get(t)??-1/0,d.get(e).bottom))}for(let r of u){let i=d.get(r),o=i.bottom>(f.get(r.closest(`[data-pour-in]`))??0)-i.height*.5;if(i.bottom<-40||i.top>innerHeight+40||i.width===0)continue;let c=getComputedStyle(r);e.font=`${c.fontWeight} ${c.fontSize} ${c.fontFamily}`;let l=c.textTransform===`uppercase`?(r.textContent??``).toUpperCase():r.textContent??``,u=i.top+n(e,l,c),p=o&&r.dataset.pour?Math.min(1,Number(r.dataset.pour)||1):0;if(p>0){e.save(),e.beginPath(),e.rect(i.left-1,u-2,i.width+2,s+3),e.clip(),e.fillStyle=a(t(r.dataset.inkLetter),p);for(let t=1;t<=s;t++)e.fillText(l,i.left,u+t);e.restore()}e.globalCompositeOperation=`lighter`,e.fillStyle=`rgb(255,0,0)`,e.fillText(l,i.left,u),e.globalCompositeOperation=`source-over`}}var s=e=>e<24;function c(e,t){let n=Math.min(Math.max(0,4-e.length),t.length);return{active:[...e,...t.slice(0,n)],waiting:t.slice(n)}}function l(e){return e.map(e=>({...e,left:e.left-1})).filter(e=>e.left>0)}function u(e,t,n,r=1/0){let i=Math.min(n||1,2,r/Math.max(e,t));return{w:Math.min(r,Math.round(e*i)),h:Math.min(r,Math.round(t*i))}}function d(e,t,n){let r=n[+(e<=700)],i=Math.min(1,1100/Math.max(e,t));return{simW:Math.max(16,Math.round(r*e/t)),simH:r,dyeW:Math.round(e*i),dyeH:Math.round(t*i)}}function f(e,t,n,r,i){return e&&n[0]===t[0]&&n[1]===t[1]&&r[0]===i[0]&&r[1]===i[1]}var p=(e,t,n,r)=>[e/n,t/r],m=(e,t,n,r)=>e!==n||Math.abs(t-r)>120,h=(e,t,n,r)=>Math.floor((e-t)/Math.max(r/n,.01)),g=(e,t)=>e>=1&&e<t?Math.max(1,Math.min(8,e>>1)):0,_=(e,t)=>Math.min(e,t),v=(e,t,n)=>Math.min(e,Math.max(1,Math.floor(t/n))),y=`#version 300 es
precision highp float; precision highp sampler2D;
in vec2 uv; out vec4 o;
`,b=`
uniform sampler2D uMask;
float solid(vec2 p) { return (p.x < 0. || p.x > 1. || p.y < 0. || p.y > 1.) ? 1. : step(.5, texture(uMask, p).r); }
`,x=`
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
`,S=`#version 300 es
in vec2 a; out vec2 uv;
void main() { uv = a * .5 + .5; gl_Position = vec4(a, 0., 1.); }`,C={advect:y+`
uniform sampler2D uVel, uMask; uniform vec2 uAsp; uniform float uDt, uDamp;
void main() {
  if (texture(uMask, uv).r > .5) { o = vec4(0.); return; }
  vec2 v = texture(uVel, uv).xy;
  o = vec4(texture(uVel, uv - uDt * v / uAsp).xy * uDamp, 0., 1.);
}`,curl:y+`
uniform sampler2D uVel; uniform vec2 uT;
void main() {
  float L = texture(uVel, uv - vec2(uT.x, 0.)).y, R = texture(uVel, uv + vec2(uT.x, 0.)).y;
  float B = texture(uVel, uv - vec2(0., uT.y)).x, T = texture(uVel, uv + vec2(0., uT.y)).x;
  o = vec4(.5 * (R - L - T + B), 0., 0., 1.);
}`,force:y+`
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
}`,divergence:y+b+`
uniform sampler2D uVel; uniform vec2 uT;
void main() {
  vec2 l = uv - vec2(uT.x, 0.), r = uv + vec2(uT.x, 0.), b = uv - vec2(0., uT.y), t = uv + vec2(0., uT.y);
  float L = solid(l) > .5 ? 0. : texture(uVel, l).x, R = solid(r) > .5 ? 0. : texture(uVel, r).x;
  float B = solid(b) > .5 ? 0. : texture(uVel, b).y, T = solid(t) > .5 ? 0. : texture(uVel, t).y;
  o = vec4(.5 * (R - L + T - B), 0., 0., 1.);
}`,pressure:y+b+`
uniform sampler2D uP, uDiv; uniform vec2 uT; uniform float uKeep;
void main() {
  vec2 l = uv - vec2(uT.x, 0.), r = uv + vec2(uT.x, 0.), b = uv - vec2(0., uT.y), t = uv + vec2(0., uT.y);
  float C = texture(uP, uv).x;
  float L = solid(l) > .5 ? C : texture(uP, l).x, R = solid(r) > .5 ? C : texture(uP, r).x;
  float B = solid(b) > .5 ? C : texture(uP, b).x, T = solid(t) > .5 ? C : texture(uP, t).x;
  o = vec4((L + R + B + T) * uKeep * .25 - texture(uDiv, uv).x * .25, 0., 0., 1.);
}`,gradient:y+b+`
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
}`,dye:y+x+`
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
}`,resample:y+`
uniform sampler2D uSrc; uniform vec2 uScale; uniform float uGain;
void main() {
  vec2 p = vec2(uv.x * uScale.x, 1. - (1. - uv.y) * uScale.y);
  o = (p.x < 0. || p.x > 1. || p.y < 0. || p.y > 1.) ? vec4(0.) : texture(uSrc, p) * uGain;
}`,show:y+x+`
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
}`};async function ee(e){let t=e.getContext(`webgl2`,{alpha:!1,antialias:!1,depth:!1,stencil:!1,powerPreference:`high-performance`,preserveDrawingBuffer:!1});if(!t)throw Error(`WebGL2 is not available`);if(!t.getExtension(`EXT_color_buffer_float`)&&!t.getExtension(`EXT_color_buffer_half_float`))throw Error(`No float render targets`);let n=t.getExtension(`WEBGL_debug_renderer_info`),r=String(n?t.getParameter(n.UNMASKED_RENDERER_WEBGL):t.getParameter(t.RENDERER)),i=(e,n)=>{let r=t.createShader(e);if(t.shaderSource(r,n),t.compileShader(r),!t.getShaderParameter(r,t.COMPILE_STATUS))throw Error(t.getShaderInfoLog(r)??`shader`);return r},a=i(t.VERTEX_SHADER,S),o={};for(let e of Object.keys(C)){await new Promise(e=>setTimeout(e,0));let n=t.createProgram();if(t.attachShader(n,a),t.attachShader(n,i(t.FRAGMENT_SHADER,C[e])),t.bindAttribLocation(n,0,`a`),t.linkProgram(n),!t.getProgramParameter(n,t.LINK_STATUS))throw Error(t.getProgramInfoLog(n)??`link`);let r=new Map;for(let e=0,i=t.getProgramParameter(n,t.ACTIVE_UNIFORMS);e<i;e++){let i=t.getActiveUniform(n,e);r.set(i.name.replace(/\[0\]$/,``),t.getUniformLocation(n,i.name))}o[e]={p:n,u:r}}let s=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,s),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.disable(t.BLEND),t.disable(t.DEPTH_TEST);let c=[],l=(e,n,r,i,a)=>{let o=t.createTexture();t.bindTexture(t.TEXTURE_2D,o),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,a),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,a),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.texImage2D(t.TEXTURE_2D,0,r,e,n,0,i,t.HALF_FLOAT,null);let s=t.createFramebuffer();t.bindFramebuffer(t.FRAMEBUFFER,s),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,o,0),t.viewport(0,0,e,n),t.clearColor(0,0,0,1),t.clear(t.COLOR_BUFFER_BIT);let l={tex:o,fbo:s,w:e,h:n};return c.push(l),l},u=(e,t,n,r,i)=>{let a={r:l(e,t,n,r,i),w:l(e,t,n,r,i),swap(){let e=a.r;a.r=a.w,a.w=e}};return a},d=t.createTexture();t.bindTexture(t.TEXTURE_2D,d),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let f={tex:d},p=0,m=0,h,g,_,v,y,b=new Float32Array(4);function x(n,r,i){let a=o[n];t.useProgram(a.p);let s=0;for(let[e,n]of Object.entries(r)){let r=a.u.get(e);r&&(typeof n==`number`?t.uniform1f(r,n):n instanceof Float32Array?t.uniform4fv(r,n):Array.isArray(n)?n.length===2?t.uniform2f(r,n[0],n[1]):t.uniform3f(r,n[0],n[1],n[2]):(t.activeTexture(t.TEXTURE0+s),t.bindTexture(t.TEXTURE_2D,n.tex),t.uniform1i(r,s++)))}i?(t.bindFramebuffer(t.FRAMEBUFFER,i.fbo),t.viewport(0,0,i.w,i.h)):(t.bindFramebuffer(t.FRAMEBUFFER,null),t.viewport(0,0,e.width,e.height)),t.drawArrays(t.TRIANGLES,0,3)}return{path:`WebGL2`,renderer:r,rows:[256,200],resize(e,n,r,i,a){let o=c.splice(0),s=o.length>0,d=s&&h.r,f=s&&_.r;p=r,m=i,h=u(e,n,t.RG16F,t.RG,t.LINEAR),g=u(e,n,t.R16F,t.RED,t.NEAREST),v=l(e,n,t.R16F,t.RED,t.NEAREST),y=l(e,n,t.R16F,t.RED,t.NEAREST),_=u(p,m,t.RGBA16F,t.RGBA,t.LINEAR),a&&d&&f&&(x(`resample`,{uSrc:d,uScale:a,uGain:1/a[1]},h.r),x(`resample`,{uSrc:f,uScale:a,uGain:1},_.r));for(let e of o)t.deleteTexture(e.tex),t.deleteFramebuffer(e.fbo)},mask(e){t.bindTexture(t.TEXTURE_2D,d),t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,!0),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,e),t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,!1)},step(e){let{p:t,asp:n,T:r}=e;x(`advect`,{uVel:h.r,uMask:f,uAsp:n,uDt:e.dt,uDamp:t.damp},h.w),h.swap(),x(`curl`,{uVel:h.r,uT:r},v),x(`force`,{uVel:h.r,uCurl:v,uDye:_.r,uMask:f,uT:r,uAsp:n,uPtr:e.ptr,uPtrV:e.ptrV,uBurstA:e.bA,uBurstB:e.bB,uDt:e.dt,uTime:e.time,uGrav:t.grav,uConf:e.conf,uPtrR:t.ptrR,uSway:t.sway,uPush:t.push,uScroll:e.scroll},h.w),h.swap(),x(`divergence`,{uVel:h.r,uMask:f,uT:r},y);for(let e=0;e<t.iters;e++)x(`pressure`,{uP:g.r,uDiv:y,uMask:f,uT:r,uKeep:e===0?.9:1},g.w),g.swap();x(`gradient`,{uP:g.r,uVel:h.r,uMask:f,uT:r},h.w),h.swap(),x(`dye`,{uDye:_.r,uVel:h.r,uMask:f,uAsp:n,uDt:e.dt,uDecay:e.decay,uTime:e.time,uRate:t.rate,uCap:t.cap,uBurstA:e.bA,uBurstC:e.bC},_.w),_.swap()},finish(){t.bindFramebuffer(t.FRAMEBUFFER,_.r.fbo),t.readPixels(0,0,1,1,t.RGBA,t.FLOAT,b)},draw(e){x(`show`,{uDye:_.r,uDT:[1/p,1/m],uGround:e.ground,uA:e.a,uB:e.b,uC:e.c,uGain:e.gain,uToe:e.toe},null)}}}var w=`
struct U {
  asp: vec2f, T: vec2f, ptr: vec2f, ptrV: vec2f,
  dt: f32, time: f32, grav: f32, conf: f32,
  ptrR: f32, sway: f32, push: f32, scroll: f32,
  damp: f32, decay: f32, rate: f32, cap: f32,
  bA: array<vec4f, 4>, bB: array<vec4f, 4>, bC: array<vec4f, 4>,
};
`,te=`
fn h21(p0: vec2f) -> f32 { var p = fract(p0 * vec2f(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
fn vn(p: vec2f) -> f32 { let i = floor(p); var f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2f(1, 0)), f.x), mix(h21(i + vec2f(0, 1)), h21(i + vec2f(1, 1)), f.x), f.y); }
`,T=`
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(outT); if (gid.x >= dim.x || gid.y >= dim.y) { return; }
  let d = vec2i(dim); let c = vec2i(gid.xy); let uv = (vec2f(gid.xy) + .5) / vec2f(dim);
`,E=`
fn sol(c: vec2i, d: vec2i) -> bool { if (any(c < vec2i(0)) || any(c >= d)) { return true; } return textureLoad(solidT, c, 0).r > .5; }
fn cl(c: vec2i, d: vec2i) -> vec2i { return clamp(c, vec2i(0), d - 1); }
`,D=`let l = c + vec2i(-1, 0); let r = c + vec2i(1, 0); let b = c + vec2i(0, -1); let t = c + vec2i(0, 1);`,O={solid:`
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var maskT: texture_2d<f32>;
@group(0) @binding(2) var outT: texture_storage_2d<r32float, write>;
`+T+`
  textureStore(outT, c, vec4f(step(.5, textureSampleLevel(maskT, samp, uv, 0.).r), 0., 0., 1.));
}`,advect:w+`
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var velIn: texture_2d<f32>;
@group(0) @binding(3) var solidT: texture_2d<f32>;
@group(0) @binding(4) var outT: texture_storage_2d<rgba16float, write>;
`+T+`
  if (textureLoad(solidT, c, 0).r > .5) { textureStore(outT, c, vec4f(0.)); return; }
  let v = textureLoad(velIn, c, 0).xy;
  textureStore(outT, c, vec4f(textureSampleLevel(velIn, samp, uv - u.dt * v / u.asp, 0.).xy * u.damp, 0., 1.));
}`,curl:`
@group(0) @binding(0) var velIn: texture_2d<f32>;
@group(0) @binding(1) var outT: texture_storage_2d<r32float, write>;
fn V(c: vec2i, d: vec2i) -> vec2f { return textureLoad(velIn, clamp(c, vec2i(0), d - 1), 0).xy; }
`+T+`
  let L = V(c + vec2i(-1, 0), d).y; let R = V(c + vec2i(1, 0), d).y;
  let B = V(c + vec2i(0, -1), d).x; let T = V(c + vec2i(0, 1), d).x;
  textureStore(outT, c, vec4f(.5 * (R - L - T + B), 0., 0., 1.));
}`,force:w+`
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var velIn: texture_2d<f32>;
@group(0) @binding(3) var curlT: texture_2d<f32>;
@group(0) @binding(4) var dyeIn: texture_2d<f32>;
@group(0) @binding(5) var maskT: texture_2d<f32>;
@group(0) @binding(6) var outT: texture_storage_2d<rgba16float, write>;
fn K(c: vec2i, d: vec2i) -> f32 { return textureLoad(curlT, clamp(c, vec2i(0), d - 1), 0).r; }
`+T+`
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
}`,divergence:`
@group(0) @binding(0) var velIn: texture_2d<f32>;
@group(0) @binding(1) var solidT: texture_2d<f32>;
@group(0) @binding(2) var outT: texture_storage_2d<r32float, write>;
`+E+T+D+`
  let L = select(textureLoad(velIn, cl(l, d), 0).x, 0., sol(l, d)); let R = select(textureLoad(velIn, cl(r, d), 0).x, 0., sol(r, d));
  let B = select(textureLoad(velIn, cl(b, d), 0).y, 0., sol(b, d)); let T = select(textureLoad(velIn, cl(t, d), 0).y, 0., sol(t, d));
  textureStore(outT, c, vec4f(.5 * (R - L + T - B), 0., 0., 1.));
}`,pressure:`
struct J { keep: f32 };
@group(0) @binding(0) var<uniform> k: J;
@group(0) @binding(1) var pIn: texture_2d<f32>;
@group(0) @binding(2) var divT: texture_2d<f32>;
@group(0) @binding(3) var solidT: texture_2d<f32>;
@group(0) @binding(4) var outT: texture_storage_2d<r32float, write>;
`+E+T+D+`
  let C = textureLoad(pIn, c, 0).r;
  let L = select(textureLoad(pIn, cl(l, d), 0).r, C, sol(l, d)); let R = select(textureLoad(pIn, cl(r, d), 0).r, C, sol(r, d));
  let B = select(textureLoad(pIn, cl(b, d), 0).r, C, sol(b, d)); let T = select(textureLoad(pIn, cl(t, d), 0).r, C, sol(t, d));
  textureStore(outT, c, vec4f((L + R + B + T) * k.keep * .25 - textureLoad(divT, c, 0).r * .25, 0., 0., 1.));
}`,gradient:`
@group(0) @binding(0) var pIn: texture_2d<f32>;
@group(0) @binding(1) var velIn: texture_2d<f32>;
@group(0) @binding(2) var solidT: texture_2d<f32>;
@group(0) @binding(3) var outT: texture_storage_2d<rgba16float, write>;
`+E+T+`
  if (sol(c, d)) { textureStore(outT, c, vec4f(0.)); return; }
  `+D+`
  let sL = sol(l, d); let sR = sol(r, d); let sB = sol(b, d); let sT = sol(t, d);
  let C = textureLoad(pIn, c, 0).r;
  let L = select(textureLoad(pIn, cl(l, d), 0).r, C, sL); let R = select(textureLoad(pIn, cl(r, d), 0).r, C, sR);
  let B = select(textureLoad(pIn, cl(b, d), 0).r, C, sB); let T = select(textureLoad(pIn, cl(t, d), 0).r, C, sT);
  var v = textureLoad(velIn, c, 0).xy - .5 * vec2f(R - L, T - B);
  if (sL && v.x < 0.) { v.x = 0.; } if (sR && v.x > 0.) { v.x = 0.; }
  if (sB && v.y < 0.) { v.y = 0.; } if (sT && v.y > 0.) { v.y = 0.; }
  textureStore(outT, c, vec4f(v, 0., 1.));
}`,dye:w+te+`
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var dyeIn: texture_2d<f32>;
@group(0) @binding(3) var velIn: texture_2d<f32>;
@group(0) @binding(4) var maskT: texture_2d<f32>;
@group(0) @binding(5) var outT: texture_storage_2d<rgba16float, write>;
`+T+`
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
}`,resample:`
@group(0) @binding(0) var<uniform> k: vec4f;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var srcT: texture_2d<f32>;
@group(0) @binding(3) var outT: texture_storage_2d<rgba16float, write>;
`+T+`
  let p = vec2f(uv.x * k.x, 1. - (1. - uv.y) * k.y);
  if (any(p < vec2f(0.)) || any(p > vec2f(1.))) { textureStore(outT, c, vec4f(0.)); return; }
  textureStore(outT, c, textureSampleLevel(srcT, samp, p, 0.) * k.z);
}`},k=te+`
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
}`,A=/swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|warp/i;async function ne(e){let t=null;for(let e of[{powerPreference:`high-performance`},{featureLevel:`compatibility`,powerPreference:`high-performance`}]){let n=await navigator.gpu.requestAdapter(e).catch(()=>null);if(!n)continue;let r=n.info;if(!r.isFallbackAdapter&&!A.test(`${r.vendor} ${r.architecture} ${r.device} ${r.description}`))return{a:n,soft:!1};t??=n}return e&&t?{a:t,soft:!0}:null}function re(){try{let e=document.createElement(`canvas`).getContext(`webgl2`);if(!e)return``;let t=e.getExtension(`WEBGL_debug_renderer_info`),n=String(t?e.getParameter(t.UNMASKED_RENDERER_WEBGL):e.getParameter(e.RENDERER));return e.getExtension(`WEBGL_lose_context`)?.loseContext(),n}catch{return``}}var ie=3;async function j(e,t,n){let r=await ne(t);if(!r)throw Error(t?`No WebGPU adapter`:`No hardware WebGPU adapter`);let i=await r.a.requestDevice({requiredLimits:{maxTextureDimension2D:r.a.limits.maxTextureDimension2D}});i.pushErrorScope(`out-of-memory`),i.pushErrorScope(`validation`);let a=!0;i.lost.then(e=>{a&&e.reason!==`destroyed`&&(a=!1,n(`the WebGPU device was lost`))});let o={},s=i.createShaderModule({code:k,label:`show`}),c=navigator.gpu.getPreferredCanvasFormat(),[l]=await Promise.all([i.createRenderPipelineAsync({label:`show`,layout:`auto`,primitive:{topology:`triangle-list`},vertex:{module:s,entryPoint:`vs`},fragment:{module:s,entryPoint:`fs`,targets:[{format:c}]}}),...Object.keys(O).map(async e=>{o[e]=await i.createComputePipelineAsync({label:e,layout:`auto`,compute:{module:i.createShaderModule({code:O[e],label:e}),entryPoint:`main`}})})]).catch(e=>{throw a=!1,i.destroy(),e}),u=0,d=e=>({id:++u,r:e}),f=e=>i.createBuffer({size:e,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),p=d(i.createSampler({magFilter:`linear`,minFilter:`linear`,addressModeU:`clamp-to-edge`,addressModeV:`clamp-to-edge`})),m=f(272),h=f(96),g=d({buffer:m}),_=d({buffer:h}),v=new Float32Array(68),y=new Float32Array(24),b=e=>{let t=f(16);return i.queue.writeBuffer(t,0,new Float32Array([e,0,0,0])),d({buffer:t})},x=b(.9),S=b(1),C=f(16),ee=f(16),w=d({buffer:C}),te=d({buffer:ee}),T=[],E=GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING,D=(e,t,n,r=E)=>{let a=i.createTexture({size:[e,t],format:n,usage:r});return T.push(a),{...d(a.createView()),t:a}},A=(e,t,n)=>{let r={r:D(e,t,n),w:D(e,t,n),swap(){let e=r.r;r.r=r.w,r.w=e}};return r},j=0,M=0,N=0,P=0,ae=!0,oe=null,F=null,I=0,L,R,z,B,V,H,U,W=new Map;function G(e,t,n,r,a){let s=o[t],c=t+n.map(e=>`:`+e.id).join(``),l=W.get(c);l||(l=i.createBindGroup({layout:s.getBindGroupLayout(0),entries:n.map((e,t)=>({binding:t,resource:e.r}))}),W.set(c,l)),e.setPipeline(s),e.setBindGroup(0,l),e.dispatchWorkgroups(Math.ceil(r/8),Math.ceil(a/8))}let K=null;function se(e,t){y.set([...t.ground,0,...t.a,0,...t.b,0,...t.c,0,1/N,1/P,t.gain,t.toe]),i.queue.writeBuffer(h,0,y);let n=`show:`+z.r.id,r=W.get(n);r||(r=i.createBindGroup({layout:l.getBindGroupLayout(0),entries:[_,p,z.r].map((e,t)=>({binding:t,resource:e.r}))}),W.set(n,r));let a=i.createCommandEncoder(),o=a.beginRenderPass({colorAttachments:[{view:e,loadOp:`clear`,storeOp:`store`,clearValue:[0,0,0,1]}]});o.setPipeline(l),o.setBindGroup(0,r),o.draw(3),o.end(),i.queue.submit([a.finish()])}let q=r.a.info,ce={path:`WebGPU compute`,renderer:!r.soft&&re()||q.description||[q.vendor,q.architecture].filter(Boolean).join(` `)||`WebGPU adapter`,rows:[320,250],resize(e,t,n,r,a){let o=T,s=o.length>0,c=s&&L.r,l=s&&z.r;if(T=[],W.clear(),j=e,M=t,N=n,P=r,L=A(j,M,`rgba16float`),z=A(N,P,`rgba16float`),R=A(j,M,`r32float`),B=D(j,M,`r32float`),V=D(j,M,`r32float`),H=D(j,M,`r32float`),U=D(N,P,`rgba8unorm`,GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT),a&&c&&l){i.queue.writeBuffer(C,0,new Float32Array([a[0],a[1],1/a[1],0])),i.queue.writeBuffer(ee,0,new Float32Array([a[0],a[1],1,0]));let e=i.createCommandEncoder(),t=e.beginComputePass();G(t,`resample`,[w,p,c,L.r],j,M),G(t,`resample`,[te,p,l,z.r],N,P),t.end(),i.queue.submit([e.finish()]),W.clear()}for(let e of o)e.destroy()},get stepCost(){return I},maxSize:i.limits.maxTextureDimension2D,mask(e){if(ae)try{return i.queue.copyExternalImageToTexture({source:e,flipY:!0},{texture:U.t},[N,P])}catch{ae=!1}let t=e.getContext(`2d`).getImageData(0,0,N,P).data,n=N*4;oe?.length!==t.length&&(oe=new Uint8Array(t.length));for(let e=0;e<P;e++)oe.set(t.subarray(e*n,e*n+n),(P-1-e)*n);i.queue.writeTexture({texture:U.t},oe,{bytesPerRow:n},[N,P])},step(e){let{p:t}=e;F=e,v.set([...e.asp,...e.T,...e.ptr,...e.ptrV,e.dt,e.time,t.grav,e.conf,t.ptrR,t.sway,t.push,e.scroll,t.damp,e.decay,t.rate,t.cap]),v.set(e.bA,20),v.set(e.bB,36),v.set(e.bC,52),i.queue.writeBuffer(m,0,v);let n=i.createCommandEncoder(),r=n.beginComputePass();G(r,`solid`,[p,U,H],j,M),G(r,`advect`,[g,p,L.r,H,L.w],j,M),L.swap(),G(r,`curl`,[L.r,B],j,M),G(r,`force`,[g,p,L.r,B,z.r,U,L.w],j,M),L.swap(),G(r,`divergence`,[L.r,H,V],j,M);for(let e=0;e<t.iters;e++)G(r,`pressure`,[e===0?x:S,R.r,V,H,R.w],j,M),R.swap();G(r,`gradient`,[R.r,L.r,H,L.w],j,M),L.swap(),G(r,`dye`,[g,p,z.r,L.r,U,z.w],N,P),z.swap(),r.end(),i.queue.submit([n.finish()])},draw(e){K&&se(K.getCurrentTexture().createView(),e)},async commit(t){let r=i.createTexture({size:[e.width,e.height],format:c,usage:GPUTextureUsage.RENDER_ATTACHMENT});if(se(r.createView(),t),await i.queue.onSubmittedWorkDone(),r.destroy(),F){let e=new Float32Array(16),t=performance.now();for(let t=0;t<3;t++)ce.step({...F,bA:e,bB:e,bC:e});await i.queue.onSubmittedWorkDone(),I=(performance.now()-t)/3}let o=await i.popErrorScope()??await i.popErrorScope();if(o||!a)throw a=!1,i.destroy(),Error(o?.message??`WebGPU device lost`);if(K=e.getContext(`webgpu`),!K)throw a=!1,i.destroy(),Error(`No WebGPU canvas context`);K.configure({device:i,format:c,alphaMode:`opaque`});let s=0;i.addEventListener(`uncapturederror`,e=>{let t=e.error.message;console.warn(`WebGPU error:`,t),++s===ie&&a&&(a=!1,n(`WebGPU errors: ${t}`))})},abandon(){a=!1,i.destroy()}};return ce}var M={damp:.9994,decay:.9972,grav:.7,conf:4,sway:.03,push:1.6,rate:28,cap:2.6,gain:2.1,toe:.4,iters:28,ptrR:.0032},N={a:[202/255,81/255,72/255],b:[210/255,149/255,40/255],c:[128/255,85/255,170/255]},P={light:{ground:[.914,.937,.949],...N,gain:M.gain,toe:M.toe},dark:{ground:[16/255,19/255,30/255],...N,gain:M.gain,toe:M.toe}},ae={0:[1,0,0],1:[0,1,0],2:[0,0,1]},oe=1e3;function F(e,t,n){let r=new URLSearchParams(location.search).get(`ink`),i=document.createElement(`canvas`),a=i.getContext(`2d`,{willReadFrequently:!1}),y=null,b=0,x=0,S=0,C=0,w=null,te=0,T=0;function E(){if(!y||!innerWidth||!innerHeight)return!1;let{w:t,h:n}=u(innerWidth,innerHeight,devicePixelRatio,y.maxSize),r=w===y;return!f(r,[t,n],[e.width,e.height],[te,T],[innerWidth,innerHeight])&&(e.width=t,e.height=n,{simW:b,simH:x,dyeW:S,dyeH:C}=d(innerWidth,innerHeight,y.rows),i.width=S,i.height=C,y.resize(b,x,S,C,r?p(innerWidth,innerHeight,te,T):void 0),w=y,te=innerWidth,T=innerHeight,O=!0,!0)}let D=[],O=!0,k={x:-1,y:-1,ax:0,ay:0},A=[],ne=[],re=new Float32Array(16),ie=new Float32Array(16),N=new Float32Array(16),F=0,I=0;function L(e){if(!y||w!==y)return;O&&=(o(a,S,C,D,Math.max(5,9*C/innerHeight*(innerHeight/900))),y.mask(i),!1);let t=[k.ax*9,k.ay*9];k.ax=0,k.ay=0,{active:ne,waiting:A}=c(ne,A),re.fill(0),ie.fill(0),N.fill(0),ne.forEach((e,t)=>{re.set(e.a,t*4),ie.set(e.b,t*4),N.set(e.c,t*4),e.c=[e.c[0],e.c[1],e.c[2],0]}),y.step({p:M,dt:e,time:I,conf:M.conf*x/256,decay:M.decay**(e*60),scroll:F,asp:[b/x,1],T:[1/b,1/x],ptr:[k.x,k.y],ptrV:t,bA:re,bB:ie,bC:N}),F*=.5,ne=l(ne),I+=e}let R=P[t],z=()=>{try{y&&w===y&&y.draw(R)}catch(e){Se(e)}},B=!1,V=0,H=0,U=60,W=0;function G(e){V=requestAnimationFrame(G);let t=e-H;H=e,t>0&&t<500&&(U+=(1e3/t-U)*.05);let n=performance.now();try{L(1/60)}catch(e){return Se(e)}z(),W+=(performance.now()-n-W)*.05}let K=()=>!innerWidth||!innerHeight;addEventListener(`pointermove`,e=>{K()||(k.x>=0&&(k.ax+=e.movementX/innerHeight,k.ay-=e.movementY/innerHeight),k.x=e.clientX/innerWidth,k.y=1-e.clientY/innerHeight)},{passive:!0});let se=scrollY;addEventListener(`scroll`,()=>{let e=scrollY-se;se=scrollY,F=Math.max(-.08,Math.min(.08,F+e*.0012)),O=!0},{passive:!0});let q=0,ce=0;addEventListener(`resize`,()=>{cancelAnimationFrame(q),q=requestAnimationFrame(()=>{let e=w!==y;if(E()){if(e&&Y)return he();z(),Q&&!J&&m(innerWidth,innerHeight,ue,de)&&(clearTimeout(ce),ce=window.setTimeout(()=>{Q&&!J&&y&&w===y&&(y.resize(b,x,S,C),O=!0,me(...Q))},200))}})}),document.addEventListener(`visibilitychange`,()=>{document.hidden?Z():J&&X()});let J=!1,Y=!1;function X(){!B&&Y&&(B=!0,H=performance.now(),V=requestAnimationFrame(G))}function Z(){B=!1,cancelAnimationFrame(V)}let le=null,Q=null,ue=0,de=0,fe,pe=new Promise(e=>{fe=e});function me(e,t){if(Q=[e,t],!Y||!y||w!==y)return le=[e,t],0;ue=innerWidth,de=innerHeight;let n=y,r=n.finish?.bind(n),i=performance.now(),a=0;try{if(r){let n=e=>{let n=performance.now();for(let t=0;t<e;t++)L(1/60);a+=e,r();let o=performance.now();return h(t,o-i,e,o-n)};r();let o=n(1),s=g(o,e-a);s&&(o=n(s));for(let t=_(e-a,o);t>0;t--)L(1/60),a++}else for(n.stepCost&&(e=v(e,t,n.stepCost));a<e&&performance.now()-i<t;)L(1/60),a++}catch(e){return Se(e),a}return z(),a}function he(){if(Y=!0,w!==y)return fe();le?me(...le):Q&&!J&&me(...Q),le=null,J&&!document.hidden?X():z(),fe()}let ge=!1;async function _e(){ge||(ge=!0,e.addEventListener(`webglcontextlost`,e=>{e.preventDefault(),Z(),y=w=null,Y=!1}),e.addEventListener(`webglcontextrestored`,()=>{y=w=null,_e().catch(e=>ve(e))})),y=await ee(e),E(),he()}function ve(e){Z(),y=null,Y=!1,console.info(`Ink is off:`,e.message),n?.(e),fe()}let ye=!1,$=null,be=e=>{ye||(ye=!0,console.info(`Ink on WebGL2: ${e}`),_e().catch(e=>ve(e)))},xe=t=>{if(!$||y!==$)return;Z(),y=null,Y=!1,$.abandon();let n=e.cloneNode();e.replaceWith(n),e=n,ye=!1,be(t)};function Se(e){if($&&y===$)return xe(`WebGPU failed: ${e.message}`);ve(e)}if(r===`webgl2`||!(`gpu`in navigator))_e().catch(e=>ve(e));else{let t=setTimeout(()=>be(`WebGPU took too long to start`),oe);j(e,r===`webgpu`,xe).then(async e=>{if($=e,ye)return $.abandon();if(y=$,E(),w!==y)throw Error(`no viewport yet`);if(L(1/60),await $.commit(R),ye)return y===$&&(y=null),$.abandon();clearTimeout(t),ye=!0,he()}).catch(e=>{clearTimeout(t),$&&y===$&&(y=null),$?.abandon(),be(e.message)})}return{ready:pe,invalidate(){O=!0},setEmitters(e){D=e,O=!0},burst(e,t,n,r=1,i=57,a=i,{dir:o=[0,0],spread:c=1,steps:l=1}={}){s(A.length)&&!K()&&A.push({a:[e/innerWidth,1-t/innerHeight,i/innerHeight,a/innerHeight],b:[o[0],-o[1],c,.9*r],c:[...ae[n],1.4*r],left:l})},stir(e,t,n,r){K()||(k.x=e/innerWidth,k.y=1-t/innerHeight,k.ax+=n/innerHeight,k.ay-=r/innerHeight)},setTheme(e){R=P[e],B||z()},setRunning(e){J=e,e&&!document.hidden?X():(Z(),z())},preroll:me,info:()=>({path:y?.path??`…`,renderer:y?.renderer??``,grid:y?`${b} × ${x}`:`…`,stepMs:W,fps:U,running:B})}}var I=`900 100px "Big Shoulders Display Variable"`,L=()=>matchMedia(`(prefers-reduced-motion: reduce)`).matches;function R(e,t){if(e.dataset.split)return[...e.querySelectorAll(`[data-ink-letter]`)];e.dataset.split=`1`,e.setAttribute(`aria-label`,e.textContent?.replace(/\s+/g,` `).trim()??``);let n=[],r=0;for(let i of e.querySelectorAll(`[data-word]`)){let e=i.textContent??``;i.textContent=``,i.setAttribute(`aria-hidden`,`true`);for(let a of e){let e=document.createElement(`span`);e.textContent=a,e.dataset.inkLetter=t[r%t.length],e.style.setProperty(`--i`,String(r++)),i.append(e),n.push(e)}}return n}var z=.22,B={down:1.1,fan:.35,steps:6},V=e=>(e.endsWith(`ms`)?parseFloat(e):parseFloat(e)*1e3)||0,H=new WeakMap;function U(e,n,{replay:r=!1}={}){let a=e[0];if(!a)return Promise.resolve();H.get(a)?.abort();let o=new AbortController,{signal:s}=o;H.set(a,o);for(let t of e)delete t.dataset.pour,t.classList.remove(`landed`);let c=a.closest(`[data-pour-in]`);if(L()){c?.classList.add(`poured`);for(let t of e)t.dataset.pour=`1`,t.classList.add(`landed`);return n?.invalidate(),Promise.resolve()}c&&(c.classList.remove(`pouring`,`poured`),r&&c.offsetWidth,c.classList.add(`pouring`));let l=e=>{if(s.aborted||e.dataset.pour||(e.dataset.pour=`1`,n?.invalidate(),!n))return;let r=e.getBoundingClientRect();r.bottom<0||r.top>innerHeight||n.burst(r.left+r.width/2,i(e)+6,t(e.dataset.inkLetter),1,r.width*.42,r.width*.22,{dir:[0,B.down],spread:B.fan,steps:B.steps})},u=e.map(e=>{let t=getComputedStyle(e);return{l:e,anim:e.getAnimations().find(e=>e.animationName===`pour-in`),at:V(t.animationDelay)+V(t.animationDuration)*z+20}}),d=()=>{if(!s.aborted){for(let e of u){let t=e.anim?.currentTime;!e.l.dataset.pour&&typeof t==`number`&&t>=e.at&&l(e.l)}n?.invalidate(),requestAnimationFrame(d)}};return requestAnimationFrame(d),Promise.all(u.map(({l:e,at:t})=>new Promise(n=>{let r=()=>{s.aborted||(l(e),e.classList.add(`landed`),n())};e.addEventListener(`animationend`,r,{once:!0,signal:s});let i=setTimeout(r,t+2400);s.addEventListener(`abort`,()=>{clearTimeout(i),n()},{once:!0})}))).then(()=>{s.aborted||(o.abort(),c?.classList.add(`poured`))})}var W={in:240,out:400};function G(e,t,n){let r=n/(t>e?W.in:W.out);return e+Math.sign(t-e)*Math.min(Math.abs(t-e),r)}function K(e,n=()=>[]){let r=new Map,i=0,a=0,o=t=>{i=0;let s=a&&t-a<100?t-a:1e3/60;a=t;let c=!1;for(let[e,t]of r)t.s=G(t.s,t.target,s),t.s!==t.target&&(c=!0),t.s<=0&&t.target===0&&r.delete(e);e.setEmitters([...n(),...[...r].map(([e,t])=>({rect:e.getBoundingClientRect(),ink:t.ink,strength:t.s*.45}))]),c||r.size?i=requestAnimationFrame(o):a=0},s=(e,n)=>{if(L())return;let a=r.get(e)??{ink:t(e.dataset.bleed),s:0,target:0};a.target=+!!n,r.set(e,a),i||=requestAnimationFrame(o)},c=e=>e.target?.closest?.(`[data-bleed]`);return document.addEventListener(`pointerover`,e=>{let t=c(e);t&&s(t,!0)}),document.addEventListener(`pointerout`,e=>{let t=c(e);t&&!t.contains(e.relatedTarget)&&s(t,!1)}),document.addEventListener(`focusin`,e=>{let t=c(e);t&&s(t,!0)}),document.addEventListener(`focusout`,e=>{let t=c(e);t&&s(t,!1)}),{refresh:()=>{i||=requestAnimationFrame(o)}}}function se(e){document.addEventListener(`pointerdown`,n=>{let r=n.target?.closest?.(`[data-splash]`);r&&!L()&&e.burst(n.clientX,n.clientY,t(r.dataset.splash),1)}),document.addEventListener(`keydown`,n=>{if(n.key!==`Enter`&&n.key!==` `)return;let r=n.target?.closest?.(`[data-splash]`);if(!r||L())return;let i=r.getBoundingClientRect();e.burst(i.left+i.width/2,i.top+i.height/2,t(r.dataset.splash),1)})}function q(){let e=document.documentElement,t=0,n=()=>{clearTimeout(t),e.style.scrollBehavior=``};document.addEventListener(`click`,r=>{if(L()||r.defaultPrevented||r.button!==0||r.metaKey||r.ctrlKey||r.shiftKey||r.altKey)return;let i=r.target?.closest?.(`a[href^="#"]:not(.skip)`);!i||i.hash.length<2||!document.getElementById(decodeURIComponent(i.hash.slice(1)))||(e.style.scrollBehavior=`smooth`,addEventListener(`scrollend`,n,{once:!0}),t=window.setTimeout(n,1500))})}function ce(e,t=innerWidth/2,n=innerHeight*.6,r=2200){if(L())return;let i=performance.now(),a=t+260,o=n,s=c=>{let l=Math.min(1,(c-i)/r),u=l*Math.PI*2,d=t+Math.cos(u)*Math.min(320,innerWidth*.3),f=n+Math.sin(u*2)*110;e.stir(d,f,d-a,f-o),a=d,o=f,l<1&&requestAnimationFrame(s)};requestAnimationFrame(s)}function J(e=document){for(let t of e.querySelectorAll(`details[data-unfold]`))t.querySelector(`summary`)?.addEventListener(`click`,e=>{document.startViewTransition&&!L()&&(e.preventDefault(),t.style.viewTransitionName=`unfold`,document.startViewTransition(()=>{t.open=!t.open}).finished.finally(()=>{t.style.viewTransitionName=``}))})}function Y(e,t){e.style.fontSize=`100px`;let n=e.querySelector(`[data-fit]`)??e,r=99.5*e.clientWidth/n.getBoundingClientRect().width;e.style.fontSize=Math.min(r,innerHeight*t).toFixed(2)+`px`}var X=document.documentElement,Z=`pf-theme`;function le(){try{let e=localStorage.getItem(Z);return e===`light`||e===`dark`?e:null}catch{return null}}var Q=matchMedia(`(prefers-color-scheme: dark)`),ue=()=>X.dataset.theme??(Q.matches?`dark`:`light`);function de(){let e=getComputedStyle(X).getPropertyValue(`--ground`).trim();for(let t of document.querySelectorAll(`meta[name="theme-color"]`))t.content=e}function fe(e){let t=le();t&&(X.dataset.theme=t),de();let n=document.getElementById(`ink`),r=null;if(n){let e=e=>{X.classList.add(`no-ink`),console.info(`Ink is off:`,e.message)};try{r=F(n,ue(),e)}catch(t){e(t)}}Q.addEventListener(`change`,()=>{r?.setTheme(ue()),de()}),pe(r);let i=document.querySelector(`[data-site-header]`);if(i){let e=()=>X.style.setProperty(`--site-header-height`,`${i.getBoundingClientRect().height}px`);e(),new ResizeObserver(e).observe(i)}let a=r?K(r):null;return r&&se(r),r?.ready.then(()=>requestAnimationFrame(()=>X.classList.add(`ink-on`))),r&&me(r),Promise.all([document.fonts.load(I).catch(()=>[]).then(()=>document.fonts.ready),r?.ready]).then(()=>{r?.invalidate();let t=L();t||r?.setRunning(!0),e?.(r),t&&r?.preroll(240,1500)}),{ink:r,bleeder:a}}function pe(e){let t=document.querySelector(`[data-theme-switch]`);if(!t)return;let n=()=>{let e=ue()===`dark`;t.toggleAttribute(`data-dark`,e),t.querySelector(`[data-theme-name]`).textContent=e?`Dark`:`Light`};n(),t.hidden=!1,t.addEventListener(`click`,()=>{let r=ue()===`dark`?`light`:`dark`,i=()=>{X.dataset.theme=r;try{localStorage.setItem(Z,r)}catch{}e?.setTheme(r),de(),n()};if(!document.startViewTransition||L())return i();let a=t.getBoundingClientRect();X.style.setProperty(`--vt-x`,`${a.left+a.width/2}px`),X.style.setProperty(`--vt-y`,`${a.top+a.height/2}px`),X.classList.add(`vt-theme`),document.startViewTransition(i).finished.finally(()=>X.classList.remove(`vt-theme`))})}function me(e){let t=document.querySelector(`[data-ink-readout]`);if(!t)return;let n=()=>{let n=e.info();t.querySelector(`[data-k=path]`).textContent=`Stable fluids, ${n.path}`,t.querySelector(`[data-k=grid]`).textContent=n.grid,t.querySelector(`[data-k=fps]`).textContent=n.running?`${Math.round(n.fps)} fps`:`still frame`;let r=n.renderer.replace(/^ANGLE \((.*)\)$/,`$1`).split(`,`);t.querySelector(`[data-k=gpu]`).textContent=(r[1]??r[0]).replace(/\s*\(.*$/,``).trim()||`…`};n(),e.ready.then(n),setInterval(n,1e3)}export{R as a,I as c,U as i,Y as n,ce as o,q as r,J as s,fe as t};