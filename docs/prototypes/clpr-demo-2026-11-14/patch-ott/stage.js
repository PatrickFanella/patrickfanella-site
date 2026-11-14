// Patch-bay stage: brand-style orthogonal cables with ports, signal pulses replaying the recorded
// round trips (slowed down), and a spectrum band built from their measured durations.
// Throwaway over-the-top prototype.
const canvas = document.getElementById('stage')
const ctx = canvas.getContext('2d')
const timing = window.STAGE_TIMING || { total: 70, trips: [] }
const COLORS = ['#bd93f9', '#ff79c6', '#50fa7b']
const still = matchMedia('(prefers-reduced-motion: reduce)').matches
let W = 0, H = 0, dpr = 1, cables = []

// Deterministic pseudo-random so the composition is stable between loads.
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

function layout() {
  dpr = Math.min(devicePixelRatio || 1, 2)
  W = canvas.clientWidth; H = canvas.clientHeight
  canvas.width = W * dpr; canvas.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  seed = 7; cables = []
  const n = W < 700 ? 5 : 9
  const top = H * 0.16, bottom = H * 0.78
  for (let i = 0; i < n; i++) {
    const y1 = top + rnd() * (bottom - top), y2 = top + rnd() * (bottom - top)
    const x0 = W * (0.04 + rnd() * 0.06), x3 = W * (0.9 + rnd() * 0.06)
    const b1 = W * (0.25 + rnd() * 0.3), b2 = W * (0.55 + rnd() * 0.3)
    const ym = top + rnd() * (bottom - top)
    const pts = [[x0, y1], [b1, y1], [b1, ym], [b2, ym], [b2, y2], [x3, y2]]
    const segs = []; let len = 0
    for (let k = 1; k < pts.length; k++) { const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); segs.push(d); len += d }
    cables.push({ pts, segs, len, color: COLORS[i % 3], phase: rnd() })
  }
}

function at(c, t) {
  let d = t * c.len
  for (let k = 0; k < c.segs.length; k++) {
    if (d <= c.segs[k]) { const a = c.pts[k], b = c.pts[k + 1], f = d / c.segs[k]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] }
    d -= c.segs[k]
  }
  return c.pts.at(-1)
}

function port(x, y, color) {
  ctx.lineWidth = 2.5; ctx.strokeStyle = color; ctx.fillStyle = '#282a36'
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()
}

function draw(now) {
  ctx.clearRect(0, 0, W, H)
  // Faint rack grid
  ctx.strokeStyle = 'rgba(189,147,249,0.06)'; ctx.lineWidth = 1
  for (let x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke() }
  for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke() }
  // Cables: a dark underlay first so crossings read as gaps, like the brand artwork.
  for (const c of cables) {
    ctx.lineJoin = 'miter'
    ctx.strokeStyle = '#21222c'; ctx.lineWidth = 12; ctx.beginPath(); c.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke()
    ctx.strokeStyle = c.color; ctx.globalAlpha = 0.55; ctx.lineWidth = 4; ctx.beginPath(); c.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke()
    ctx.globalAlpha = 1
  }
  for (const c of cables) { port(...c.pts[0], c.color); port(...c.pts.at(-1), c.color) }
  // Pulses: one per recorded round trip, spread across the cables, looping every few seconds.
  const period = Math.max(3200, timing.total * 55)
  const t = still ? 0.37 : (now % period) / period
  timing.trips.forEach((trip, i) => {
    const c = cables[i % cables.length]
    const start = trip.start / timing.total, dur = Math.max(trip.dur / timing.total, 0.06)
    let p = (t - start) / dur
    if (still) p = 0.5 + 0.08 * i
    if (p < 0 || p > 1) return
    const [x, y] = at(c, p)
    ctx.shadowColor = c.color; ctx.shadowBlur = 24
    ctx.fillStyle = '#f8f8f2'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill()
    for (let k = 1; k <= 6; k++) { const [tx, ty] = at(c, Math.max(0, p - k * 0.012)); ctx.globalAlpha = 0.5 - k * 0.07; ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(tx, ty, 4 - k * 0.4, 0, Math.PI * 2); ctx.fill() }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0
  })
  // Spectrum band: bar heights from the measured round-trip durations, gently animated.
  const bars = W < 700 ? 40 : 96, bw = W / bars, base = H - 18, maxH = H * 0.14
  const durs = timing.trips.length ? timing.trips.map((x) => x.dur) : [1]
  const peak = Math.max(...durs)
  for (let i = 0; i < bars; i++) {
    const d = durs[i % durs.length] / peak
    const wobble = still ? 0.7 : 0.55 + 0.45 * Math.abs(Math.sin(now / 420 + i * 0.37))
    const h = Math.max(4, maxH * (0.25 + 0.75 * d) * wobble)
    ctx.fillStyle = COLORS[Math.floor(i / (bars / 3)) % 3]; ctx.globalAlpha = 0.85
    ctx.fillRect(i * bw + 2, base - h, Math.max(2, bw - 5), h)
  }
  ctx.globalAlpha = 1
  if (!still) requestAnimationFrame(draw)
}

layout(); requestAnimationFrame(draw)
addEventListener('resize', () => { layout(); if (still) requestAnimationFrame(draw) })
