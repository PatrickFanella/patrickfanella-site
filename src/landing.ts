import { boot } from './boot'
import { fitWidth, pourIn, splitLetters, unfold } from './motion/motion'

// Pour once the name has its final size. The name stays hidden until the solver is ready too, so
// the first splashes are not lost.
const { ink } = boot((ink) => { layout(); void pourIn(letters, ink) })
const name = document.getElementById('name')!
const letters = splitLetters(name, 'ooyycccccyyooo')

const layout = () => { fitWidth(name, innerWidth <= 700 ? 0.17 : 0.27); ink?.invalidate() }
layout()
// Refit when the container's width changes, such as when a scrollbar appears.
new ResizeObserver(layout).observe(name)
unfold()
