import { boot } from './boot'
import { pourIn, splitLetters, stirSweep, unfold } from './motion/motion'

const { ink } = boot((ink) => { layout(); void pourIn(letters, ink) })
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
