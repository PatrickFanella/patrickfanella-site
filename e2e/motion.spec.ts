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

test('the landing name holds its fitted size before the display face loads', async ({ page }) => {
  await noWebGL(page)
  for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size)
    await page.addInitScript(() => {
      const w = window as unknown as { shift: number }
      w.shift = 0
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.shift += e.value
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await page.goto('/')
    await poured(page)
    // Before the estimate, fitting the name moved the page by a layout shift of 0.2 on a desktop.
    expect(await page.evaluate(() => (window as unknown as { shift: number }).shift), `layout shift at ${size.width} px`).toBeLessThan(0.05)
  }
})

test.describe('with motion', () => {
  test('the ink canvas stays clear until the solver draws, then fades in', async ({ page }) => {
    await page.addInitScript(() => {
      addEventListener('DOMContentLoaded', () => {
        (window as unknown as { early: string }).early = getComputedStyle(document.getElementById('ink')!).opacity
      })
    })
    await page.goto('/case-studies/')
    expect(await page.evaluate(() => (window as unknown as { early: string }).early)).toBe('0')
    await expect(page.locator('html')).toHaveClass(/\bink-on\b/, { timeout: 60_000 })
    await expect.poll(() => page.locator('#ink').evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  })

  test('the selected work rises in from the scroll position', async ({ page }) => {
    await noWebGL(page)
    await page.goto('/')
    const cards = page.locator('.featured-work > .panel')
    expect(await cards.count()).toBeGreaterThan(0)
    const rising = await cards.evaluateAll((els) => els.filter((el) => el.hasAttribute('data-rise') &&
      el.getAnimations().some((a) => (a as CSSAnimation).animationName === 'rise')).length)
    expect(rising).toBe(await cards.count())
  })

})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the selected work is in place without rising', async ({ page }) => {
    await noWebGL(page)
    await page.goto('/')
    const moving = await page.locator('.featured-work > .panel').evaluateAll((els) =>
      els.filter((el) => el.getAnimations().length > 0 || getComputedStyle(el).transform !== 'none').length)
    expect(moving).toBe(0)
  })

})
