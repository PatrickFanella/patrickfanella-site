import { boot } from './boot'
import { fitWidth, pourIn, reduced, splitLetters, unfold } from './motion/motion'

const { ink } = boot()
const name = document.getElementById('name')!
const letters = splitLetters(name, 'ooyycccccyyooo')

const layout = () => { fitWidth(name, innerWidth <= 700 ? 0.17 : 0.27); ink?.invalidate() }
layout()
// Refit when the container's width changes, such as when a scrollbar appears.
new ResizeObserver(layout).observe(name)
const faces = document.fonts.load('900 100px "Big Shoulders Display Variable"').catch(() => []).then(() => document.fonts.ready)

unfold()

// Start once the name has its final size. With motion the tank starts empty and fills as each
// letter lands; with reduced motion the solver runs ahead and the page shows one still frame.
faces.then(() => {
  layout()
  if (!ink) { pourIn(letters, null); return }
  if (reduced()) {
    pourIn(letters, ink)
    ink.preroll(240, 1500)
    return
  }
  ink.setRunning(true)
  pourIn(letters, ink)
})
