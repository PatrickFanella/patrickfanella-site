// The motion set. Each export is one named animation; /motion/ shows them all.
// Every one checks reduced motion and leaves the page complete without it.
import type { Ink } from '../ink/engine'
import { inkFromCode, letterBaseline, type Emitter, type InkId } from '../ink/mask'

export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Wrap each letter of the target's words in a span the ink can see. `inks` is one code per letter: c cobalt, o orange, y gold. */
export function splitLetters(el: HTMLElement, inks: string) {
  if (el.dataset.split) return [...el.querySelectorAll<HTMLElement>('[data-ink-letter]')]
  el.dataset.split = '1'
  // Screen readers get the word whole from aria-label, so the host needs a role that takes a name
  // (a heading, or role="img"). A hidden copy would also do it, but selection and find would see the word twice.
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

/** Where the spring curve first reaches the resting position: the moment a letter hits. */
export const IMPACT = 0.22
/** The landing splash: downward push, outward fan, and how many solver steps it keeps pushing. */
export const SPLASH = { down: 1.1, fan: 0.35, steps: 6 }
/** How long after a letter hits its ink appears, so the contact reads first. */
export const INK_DELAY = 20

const ms = (v: string) => (v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000) || 0

/**
 * pour-in: the letters drop into place left to right, 60 ms apart. Just after
 * each one hits, its ink splashes down from its foot and it starts to pour.
 * 620 ms per letter on a spring curve, which reaches rest 22% of the way in.
 */
export function pourIn(letters: HTMLElement[], ink: Ink | null, { replay = false } = {}) {
  for (const l of letters) { delete l.dataset.pour; l.classList.remove('landed') }
  const host = letters[0]?.closest<HTMLElement>('[data-pour-in]')
  if (reduced()) { host?.classList.add('poured'); for (const l of letters) { l.dataset.pour = '1'; l.classList.add('landed') } ink?.invalidate(); return Promise.resolve() }
  if (host) { host.classList.remove('pouring', 'poured'); if (replay) void host.offsetWidth; host.classList.add('pouring') }
  const hit = (l: HTMLElement) => {
    if (l.dataset.pour) return
    l.dataset.pour = '1'
    ink?.invalidate()
    if (!ink) return
    const r = l.getBoundingClientRect()
    if (r.bottom < 0 || r.top > innerHeight) return
    // A jet straight down from the foot, fanning out a little: the letter landing splashes its ink.
    ink.burst(r.left + r.width / 2, letterBaseline(l) + 6, inkFromCode(l.dataset.inkLetter), 1, r.width * 0.42, r.width * 0.22,
      { dir: [0, SPLASH.down], spread: SPLASH.fan, steps: SPLASH.steps })
  }
  // Time each splash from the letter's own animation clock, read every frame. The browser starts
  // the animation when it first renders, which can be later than this script runs, so a timer
  // started here would let the ink arrive before the letter.
  const due = letters.map((l) => {
    const cs = getComputedStyle(l)
    const anim = l.getAnimations().find((a) => (a as CSSAnimation).animationName === 'pour-in')
    return { l, anim, at: ms(cs.animationDelay) + ms(cs.animationDuration) * IMPACT + INK_DELAY }
  })
  let live = true
  const track = () => {
    if (!live) return
    for (const d of due) {
      const t = d.anim?.currentTime
      if (!d.l.dataset.pour && typeof t === 'number' && t >= d.at) hit(d.l)
    }
    ink?.invalidate()
    requestAnimationFrame(track)
  }
  requestAnimationFrame(track)
  return Promise.all(due.map(({ l, at }) => new Promise<void>((done) => {
    const land = () => { hit(l); l.classList.add('landed'); done() }
    l.addEventListener('animationend', land, { once: true })
    setTimeout(land, at + 2400) // a backstop if the animation never runs
  }))).then(() => { live = false; host?.classList.add('poured') })
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
