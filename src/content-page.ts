import { boot } from './boot'
import { reduced } from './motion/motion'

const { ink } = boot()
void ink?.ready.then(() => {
  ink.invalidate()
  ink.preroll(reduced() ? 240 : 120, 1500)
  if (!reduced()) ink.setRunning(true)
})
