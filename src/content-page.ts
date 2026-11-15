import { boot } from './boot'
import { reduced } from './motion/motion'

const { ink } = boot()
void ink?.ready.then(() => {
  ink.invalidate()
  if (reduced()) ink.preroll(240, 1500)
  else ink.setRunning(true)
})
