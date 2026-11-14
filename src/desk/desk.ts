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

/** Move focus to pane n (1 to 5); on a stacked layout the browser scrolls it into view. */
function go(n: number) { panes[n - 1]?.focus() }

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

addEventListener('resize', () => ink?.invalidate())

// The tank opens already poured, so the desk lands complete. With reduced motion it stays one still frame.
document.fonts.load('900 100px "Big Shoulders Display Variable"').catch(() => []).then(() => document.fonts.ready).then(() => {
  if (!ink) return
  ink.invalidate()
  ink.preroll(reduced() ? 240 : 120, 1500)
  if (!reduced()) ink.setRunning(true)
})
