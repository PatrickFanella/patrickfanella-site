// The desk: tiled panes on the ink tank. The name hands over from the landing page into the
// about pane (view-transition-name: name) and pours from there. Panes 3 to 5 are empty until
// PostgreSQL runs in the tab.
import { boot } from '../boot'
import { reduced, splitLetters } from '../motion/motion'
import '../styles/desk.css'

const { ink } = boot()

// The same ink per letter as on the landing page, so each letter keeps its colour across the hand-over.
// The name arrives in place, so its letters pour at once instead of dropping in.
const name = document.getElementById('name')!
for (const l of splitLetters(name, 'ooyycccccyyooo')) { l.dataset.pour = '1'; l.classList.add('landed') }

const panes = [...document.querySelectorAll<HTMLElement>('[data-pane]')]
const tags = [...document.querySelectorAll<HTMLButtonElement>('[data-go]')]

/** Move focus to pane n (1 to 5). On a stacked layout its top lands just under the sticky bar,
 *  even when the pane is taller than the window, where focus() alone may leave it under the bar. */
function go(n: number) {
  const p = panes[n - 1]
  if (!p) return
  p.focus({ preventScroll: true })
  p.scrollIntoView({ block: 'start' })
}

// Alt+1 to Alt+5. Match the physical key, since Alt+digit types a symbol on macOS.
addEventListener('keydown', (e) => {
  const m = /^Digit([1-5])$/.exec(e.code)
  if (!m || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  e.preventDefault()
  go(Number(m[1]))
})
for (const t of tags) t.addEventListener('click', () => go(Number(t.dataset.go)))

// The switcher marks the pane that holds focus, wherever focus came from: Tab, a click or Alt+n.
document.addEventListener('focusin', (e) => {
  const pane = (e.target as Element).closest<HTMLElement>('[data-pane]')
  if (!pane) return
  for (const t of tags) t.setAttribute('aria-current', String(t.dataset.go === pane.dataset.pane))
})

// The engine redraws the mask on window scroll only. On the tiled desktop the panes scroll inside
// themselves, and element scroll events do not bubble, so catch them on the way down.
addEventListener('scroll', () => ink?.invalidate(), { capture: true, passive: true })
addEventListener('resize', () => ink?.invalidate())

// The sticky bar wraps to more lines on a phone; the scroll padding that keeps a focused pane clear of it follows its height.
const bar = document.querySelector<HTMLElement>('.bar')!
new ResizeObserver(() => document.documentElement.style.setProperty('--bar-h', `${bar.offsetHeight}px`)).observe(bar)

// The tank opens already poured, so the desk lands complete. With reduced motion it stays one still frame.
document.fonts.load('900 100px "Big Shoulders Display Variable"').catch(() => []).then(() => document.fonts.ready).then(() => {
  if (!ink) return
  ink.invalidate()
  ink.preroll(reduced() ? 240 : 120, 1500)
  if (!reduced()) ink.setRunning(true)
})
