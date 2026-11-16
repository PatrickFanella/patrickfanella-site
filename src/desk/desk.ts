// The desk: tiled panes on the ink tank. The name hands over from the landing page into the
// about pane (view-transition-name: name) and pours from there. The psql pane offers opt-in Clpr
// and SQL workers; panes 4 and 5 are empty for now.
import { boot } from '../boot'
import { reduced, splitLetters } from '../motion/motion'
import '../styles/desk.css'
import { startPsql } from './psql'
import { startShell } from './shell'
import { startTelemetry } from './telemetry'

const { ink } = boot()

// The same ink per letter as on the landing page, so each letter keeps its colour across the hand-over.
// The name arrives in place, so its letters pour at once instead of dropping in.
const name = document.getElementById('name')!
for (const l of splitLetters(name, 'ooyycccccyyooo')) { l.dataset.pour = '1'; l.classList.add('landed') }

const psql = startPsql(document.querySelector<HTMLElement>('section.psql')!, startTelemetry(ink))
startShell(document.querySelector<HTMLFormElement>('[data-shell]')!, psql)

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

// Text lands complete immediately. Normal ink develops in frames rather than
// blocking interaction on a synchronous preroll; reduced motion gets one still.
document.fonts.load('900 100px "Big Shoulders Display Variable"').catch(() => []).then(() => document.fonts.ready).then(() => {
  if (!ink) return
  ink.invalidate()
  if (reduced()) ink.preroll(240, 1500)
  else ink.setRunning(true)
})
