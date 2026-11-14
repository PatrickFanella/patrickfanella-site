import { boot } from './boot'
import { pourIn, reduced, splitLetters, stirSweep, unfold } from './motion/motion'

const { ink } = boot()
const word = document.getElementById('demo-pour')!
const letters = splitLetters(word, 'coy')
const layout = () => { word.style.fontSize = ''; ink?.invalidate() }
layout()
addEventListener('resize', layout)
unfold()


const replay: Record<string, () => void> = {
  pour: () => { void pourIn(letters, ink, { replay: true }) },
  stir: () => { if (ink) stirSweep(ink) },
  rise: () => {
    const el = document.getElementById('rise-demo')!
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go')
  },
  theme: () => document.querySelector<HTMLButtonElement>('[data-theme-switch]')?.click(),
}
document.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-replay]')
  if (b) replay[b.dataset.replay!]?.()
})

document.fonts.load('900 100px "Big Shoulders Display Variable"').catch(() => []).then(() => document.fonts.ready).then(() => {
  layout()
  if (!ink) { void pourIn(letters, null); return }
  if (reduced()) { void pourIn(letters, ink); ink.preroll(240, 1500); return }
  ink.setRunning(true)
  void pourIn(letters, ink)
})
