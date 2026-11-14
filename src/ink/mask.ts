// Draws the page into the mask texture the solver reads (see shaders.ts).
// The ink canvas is fixed to the viewport, so element rects map straight onto it.

export type InkId = 0 | 1 | 2 // cobalt, orange, gold

export interface Emitter {
  /** Viewport rect whose bottom edge lets ink go. */
  rect: DOMRect
  ink: InkId
  /** 0 to 1. */
  strength: number
}

const INK_CODE: Record<string, InkId> = { c: 0, o: 1, y: 2 }

export function inkFromCode(code: string | undefined): InkId {
  return INK_CODE[code ?? ''] ?? 0
}

const emitStyle = (ink: InkId, strength: number) =>
  `rgb(0,${Math.round(255 * strength)},${Math.round(127.5 * ink * strength)})`

/**
 * Letters marked `data-ink-letter` are solid glyphs; once they carry `data-pour`
 * the strip under each foot lets that letter's ink go. Elements marked
 * `data-ink-solid` are solid rectangles. `extra` adds emitters such as a hovered button.
 */
export function drawMask(ctx: CanvasRenderingContext2D, w: number, h: number, extra: Emitter[], bandPx = 9) {
  const sx = w / innerWidth, sy = h / innerHeight
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.setTransform(sx, 0, 0, sy, 0, 0)

  ctx.fillStyle = 'rgb(255,0,0)'
  for (const el of document.querySelectorAll<HTMLElement>('[data-ink-solid]')) {
    const r = el.getBoundingClientRect()
    if (r.bottom < 0 || r.top > innerHeight) continue
    ctx.fillRect(r.left, r.top, r.width, r.height)
  }

  for (const e of extra) {
    const r = e.rect
    if (e.strength <= 0 || r.bottom < 0 || r.top > innerHeight) continue
    ctx.fillStyle = emitStyle(e.ink, e.strength)
    ctx.fillRect(r.left + 4, r.bottom, Math.max(0, r.width - 8), bandPx)
  }

  ctx.textBaseline = 'alphabetic'
  // Only the bottom line of a wrapped name pours; ink from an upper line would land on the line below.
  const all = [...document.querySelectorAll<HTMLElement>('[data-ink-letter]')]
  const rects = new Map(all.map((el) => [el, el.getBoundingClientRect()]))
  const low = new Map<Element | null, number>()
  for (const el of all) { const host = el.closest('[data-pour-in]'); low.set(host, Math.max(low.get(host) ?? -Infinity, rects.get(el)!.bottom)) }
  for (const el of all) {
    const r = rects.get(el)!
    const bottomLine = r.bottom > (low.get(el.closest('[data-pour-in]')) ?? 0) - r.height * 0.5
    if (r.bottom < -40 || r.top > innerHeight + 40 || r.width === 0) continue
    const cs = getComputedStyle(el)
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const ch = cs.textTransform === 'uppercase' ? (el.textContent ?? '').toUpperCase() : (el.textContent ?? '')
    const m = ctx.measureText(ch)
    const asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent
    const lh = parseFloat(cs.lineHeight) || asc + desc
    const base = r.top + (lh - (asc + desc)) / 2 + asc
    const pour = bottomLine && el.dataset.pour ? Math.min(1, Number(el.dataset.pour) || 1) : 0
    if (pour > 0) {
      ctx.save()
      ctx.beginPath(); ctx.rect(r.left - 1, base - 2, r.width + 2, bandPx + 3); ctx.clip()
      ctx.fillStyle = emitStyle(inkFromCode(el.dataset.inkLetter), pour)
      for (let dy = 1; dy <= bandPx; dy++) ctx.fillText(ch, r.left, base + dy)
      ctx.restore()
    }
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = 'rgb(255,0,0)'
    ctx.fillText(ch, r.left, base)
    ctx.globalCompositeOperation = 'source-over'
  }
}
