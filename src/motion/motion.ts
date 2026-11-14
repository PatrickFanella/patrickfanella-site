// The motion set. Each export is one named animation; /motion/ shows them all.
// Every one checks reduced motion and leaves the page complete without it.
import type { Ink } from '../ink/engine'
import { inkFromCode, type Emitter, type InkId } from '../ink/mask'

export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Wrap each letter of the target's words in a span the ink can see. `inks` is one code per letter: c cobalt, o orange, y gold. */
export function splitLetters(el: HTMLElement, inks: string) {
  if (el.dataset.split) return [...el.querySelectorAll<HTMLElement>('[data-ink-letter]')]
  el.dataset.split = '1'
  el.setAttribute('aria-label', el.textContent?.replace(/\s+/g, ' ').trim() ?? '')
  const letters: HTMLElement[] = []
  let n = 0
  for (const word of el.querySelectorAll<HTMLElement>('[data-word]')) {
    const text = word.textContent ?? ''
    word.textContent = ''
    word.setAttribute('aria-hidden', 'true')
    for (const ch of text) {
      const s = document.createElement('span')
      s.textContent = ch
      s.dataset.inkLetter = inks[n % inks.length]
      s.style.setProperty('--i', String(n++))
      word.append(s); letters.push(s)
    }
  }
  return letters
}

/**
 * pour-in: the letters drop into place one after another, and each starts to
 * pour the moment it lands. Duration 620 ms per letter, 55 ms stagger.
 */
export function pourIn(letters: HTMLElement[], ink: Ink | null, { replay = false } = {}) {
  for (const l of letters) { delete l.dataset.pour; l.classList.remove('landed') }
  if (reduced()) { for (const l of letters) { l.dataset.pour = '1'; l.classList.add('landed') } ink?.invalidate(); return Promise.resolve() }
  const host = letters[0]?.closest<HTMLElement>('[data-pour-in]')
  if (host) { host.classList.remove('pouring'); if (replay) void host.offsetWidth; host.classList.add('pouring') }
  let live = true
  const track = () => { if (!live) return; ink?.invalidate(); requestAnimationFrame(track) }
  requestAnimationFrame(track)
  return Promise.all(letters.map((l) => new Promise<void>((done) => {
    const land = () => { l.classList.add('landed'); l.dataset.pour = '1'; ink?.invalidate(); done() }
    l.addEventListener('animationend', land, { once: true })
    setTimeout(land, 2400) // a backstop if the animation never runs
  }))).then(() => { live = false })
}

/**
 * bleed: an element marked `data-bleed="c|o|y"` lets ink go from its bottom
 * edge while hovered or focused, fading in over 240 ms and out over 400 ms.
 */
export function bleed(ink: Ink, base: () => Emitter[] = () => []) {
  const active = new Map<HTMLElement, { ink: InkId; s: number; target: number }>()
  let raf = 0
  const tick = () => {
    raf = 0
    let moving = false
    for (const [el, a] of active) {
      const k = a.target > a.s ? 1 / 14 : 1 / 24
      a.s += Math.sign(a.target - a.s) * Math.min(Math.abs(a.target - a.s), k)
      if (a.s !== a.target) moving = true
      if (a.s <= 0 && a.target === 0) active.delete(el)
    }
    ink.setEmitters([...base(), ...[...active].map(([el, a]) => ({ rect: el.getBoundingClientRect(), ink: a.ink, strength: a.s * 0.45 }))])
    if (moving || active.size) raf = requestAnimationFrame(tick)
  }
  const set = (el: HTMLElement, on: boolean) => {
    if (reduced()) return
    const a = active.get(el) ?? { ink: inkFromCode(el.dataset.bleed), s: 0, target: 0 }
    a.target = on ? 1 : 0; active.set(el, a)
    if (!raf) raf = requestAnimationFrame(tick)
  }
  const pick = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>('[data-bleed]')
  document.addEventListener('pointerover', (e) => { const el = pick(e); if (el) set(el, true) })
  document.addEventListener('pointerout', (e) => { const el = pick(e); if (el && !el.contains(e.relatedTarget as Node)) set(el, false) })
  document.addEventListener('focusin', (e) => { const el = pick(e); if (el) set(el, true) })
  document.addEventListener('focusout', (e) => { const el = pick(e); if (el) set(el, false) })
  return { refresh: () => { if (!raf) raf = requestAnimationFrame(tick) } }
}

/** splash: a press on `data-splash` pushes the water out from the pointer and drops that element's ink. */
export function splash(ink: Ink) {
  document.addEventListener('pointerdown', (e) => {
    const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-splash]')
    if (!el || reduced()) return
    ink.burst(e.clientX, e.clientY, inkFromCode(el.dataset.splash), 1)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-splash]')
    if (!el || reduced()) return
    const r = el.getBoundingClientRect()
    ink.burst(r.left + r.width / 2, r.top + r.height / 2, inkFromCode(el.dataset.splash), 1)
  })
}

/** stir-sweep: one slow loop of the pointer across the tank, for demonstrations. */
export function stirSweep(ink: Ink, cx = innerWidth / 2, cy = innerHeight * 0.6, ms = 2200) {
  if (reduced()) return
  const t0 = performance.now(); let px = cx + 260, py = cy
  const go = (now: number) => {
    const t = Math.min(1, (now - t0) / ms), a = t * Math.PI * 2
    const x = cx + Math.cos(a) * Math.min(320, innerWidth * 0.3), y = cy + Math.sin(a * 2) * 110
    ink.stir(x, y, x - px, y - py); px = x; py = y
    if (t < 1) requestAnimationFrame(go)
  }
  requestAnimationFrame(go)
}

/**
 * unfold: a `details` element opens and closes in place through a
 * same-document view transition, so the row grows into its detail.
 */
export function unfold(root: ParentNode = document) {
  for (const d of root.querySelectorAll<HTMLDetailsElement>('details[data-unfold]')) {
    const summary = d.querySelector('summary')
    summary?.addEventListener('click', (e) => {
      if (!document.startViewTransition || reduced()) return
      e.preventDefault()
      d.style.viewTransitionName = 'unfold'
      const vt = document.startViewTransition(() => { d.open = !d.open })
      vt.finished.finally(() => { d.style.viewTransitionName = '' })
    })
  }
}

/** Fit a line of display type to its container's width, capped by a share of the viewport height. */
export function fitWidth(el: HTMLElement, maxVh: number) {
  el.style.fontSize = '100px'
  const inner = el.querySelector<HTMLElement>('[data-fit]') ?? el
  const fs = 0.995 * 100 * el.clientWidth / inner.getBoundingClientRect().width
  el.style.fontSize = Math.min(fs, innerHeight * maxVh).toFixed(2) + 'px'
}
