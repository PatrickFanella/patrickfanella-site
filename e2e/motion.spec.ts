import { test, expect, poured } from './fixtures'
import type { Page } from '@playwright/test'

// Most of these check page motion, not the ink, so they run without WebGL2: SwiftShader would
// slow every frame and blur the timings under test.
async function noWebGL(page: Page) {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
      return id === 'webgl2' ? null : (get as (...a: unknown[]) => RenderingContext | null).call(this, id, ...rest)
    } as typeof get
  })
}

test('replaying the pour is not disturbed by the run before it', async ({ page }) => {
  await noWebGL(page)
  await page.goto('/motion/')
  await poured(page)
  // Let the load's own backstop timers run out first.
  await page.waitForTimeout(3000)
  const bad = await page.evaluate(() => new Promise<string[]>((resolve) => {
    const host = document.getElementById('demo-pour')!
    const letters = [...host.querySelectorAll<HTMLElement>('[data-ink-letter]')]
    const replay = document.querySelector<HTMLButtonElement>('[data-replay=pour]')!
    const ms = (v: string) => (v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000) || 0
    const pourAnim = (l: HTMLElement) => l.getAnimations().find((a) => (a as CSSAnimation).animationName === 'pour-in')
    const bad: string[] = []
    const watch = new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as HTMLElement
        if (r.attributeName === 'data-pour' && el.dataset.pour && r.oldValue === null) {
          // A letter may start to pour only once its own animation has brought it down.
          const cs = getComputedStyle(el), t = pourAnim(el)?.currentTime
          const impact = ms(cs.animationDelay) + ms(cs.animationDuration) * 0.22
          if (typeof t === 'number' && t < impact) bad.push(`${el.textContent} poured at ${Math.round(t)} ms, before it hit at ${Math.round(impact)} ms`)
        }
        if (r.attributeName === 'class' && el === host && host.classList.contains('poured') && !(r.oldValue ?? '').includes('poured')) {
          const falling = letters.filter((l) => pourAnim(l)?.playState === 'running')
          if (falling.length) bad.push(`host marked poured with ${falling.length} letters still falling`)
        }
      }
    })
    // The first replay's backstop timers fall due 2.4 s after each letter would hit, during the
    // second replay's fall. Then a third replay starts midway through the second.
    replay.click()
    setTimeout(() => {
      watch.observe(host, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['data-pour', 'class'] })
      replay.click()
      setTimeout(() => replay.click(), 300)
      setTimeout(() => { watch.disconnect(); resolve(bad) }, 3600)
    }, 2450)
  }))
  expect(bad).toEqual([])
  await poured(page)
  await expect(page.locator('#demo-pour [data-ink-letter]:not([data-pour])')).toHaveCount(0)
})
