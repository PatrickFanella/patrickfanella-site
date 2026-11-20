import { boot } from './boot'
import { fitWidth, pourIn, splitLetters, unfold } from './motion/motion'

// Pour once the name has its final size. The name stays hidden until the solver is ready too, so
// the first splashes are not lost.
const { ink } = boot((ink) => { faceReady = true; layout(); void pourIn(letters, ink) })
const name = document.getElementById('name')!
const letters = splitLetters(name, 'ooyycccccyyooo')

// Until the display face loads, the stylesheet's estimate holds the name's size. Fitting the
// fallback face first would move the page twice: once now and again when the face arrives.
let faceReady = false
const layout = () => { if (!faceReady) return; fitWidth(name, innerWidth <= 700 ? 0.17 : 0.27); ink?.invalidate() }
// Refit when the container's width changes, such as when a scrollbar appears.
new ResizeObserver(layout).observe(name)
unfold()

// The selected work rises into place as it scrolls in, like the rows on /motion/. Set here, so
// the markup stays plain and the cards show at once without scripts.
for (const card of document.querySelectorAll<HTMLElement>('.featured-work > .panel')) card.dataset.rise = ''
