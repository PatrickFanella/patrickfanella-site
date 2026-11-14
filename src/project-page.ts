import { boot } from './boot'
import './styles/project.css'
import { pourIn, reduced, splitLetters, unfold } from './motion/motion'

// Shared by every project page and the projects index: the heading pours like the name does.
const { ink } = boot()
const title = document.querySelector<HTMLElement>('[data-pour-in]')
const letters = title ? splitLetters(title, 'coy') : []
unfold()

document.fonts.load('900 100px "Big Shoulders Display Variable"').catch(() => []).then(() => document.fonts.ready).then(() => {
  ink?.invalidate()
  if (!ink) { void pourIn(letters, null); return }
  if (reduced()) { void pourIn(letters, ink); ink.preroll(240, 1500); return }
  ink.setRunning(true)
  void pourIn(letters, ink)
})
