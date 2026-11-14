import { test, expect, poured } from './fixtures'

test('the name pours in and is fitted to the width', async ({ page }) => {
  await page.goto('/')
  await poured(page)
  const name = page.locator('#name')
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Patrick Fanella')
  await expect(page.locator('html')).not.toHaveClass(/no-ink/)
  // fitWidth sets the size so the words fill 99.5% of the heading, unless that is taller than 27% of the viewport.
  const fit = await name.evaluate((el) => {
    const inner = el.querySelector('[data-fit]')!.getBoundingClientRect().width
    return { ratio: inner / el.clientWidth, size: parseFloat(getComputedStyle(el).fontSize), cap: innerHeight * 0.27 }
  })
  expect(fit.size).toBeLessThan(fit.cap)
  expect(fit.ratio).toBeGreaterThan(0.98)
  expect(fit.ratio).toBeLessThanOrEqual(1)
  // The solver is running, so the readout shows a grid and a frame rate.
  await expect(page.locator('[data-k=grid]')).toHaveText(/^\d+ × \d+$/)
  await expect(page.locator('[data-k=fps]')).toHaveText(/^\d+ fps$/)
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the name is in place and the ink is a still frame', async ({ page }) => {
    await page.goto('/')
    await poured(page)
    const letters = page.locator('#name [data-ink-letter]')
    await expect(letters).toHaveCount(14)
    const moving = await letters.evaluateAll((ls) => ls.filter((l) =>
      !l.classList.contains('landed') || getComputedStyle(l).transform !== 'none' || l.getAnimations().length > 0).length)
    expect(moving).toBe(0)
    await expect(page.locator('html')).not.toHaveClass(/no-ink/)
    await expect(page.locator('[data-k=fps]')).toHaveText('still frame')
    // The readout repaints every second; it must stay still.
    await page.waitForTimeout(1500)
    await expect(page.locator('[data-k=fps]')).toHaveText('still frame')
  })

  // The run-ahead has a 1.5 s budget. Timing only the submits let SwiftShader queue every step
  // and hold the page for 20 s. A screenshot needs a new frame from the GPU, so it waits out
  // any solver work still queued.
  test('the page settles within 3 s of the fonts loading', async ({ page }) => {
    await page.addInitScript(() => {
      addEventListener('DOMContentLoaded', () => {
        void document.fonts.load('900 100px "Big Shoulders Display Variable"').then(() => document.fonts.ready)
          .then(() => { (window as unknown as { fontsAt: number }).fontsAt = performance.timeOrigin + performance.now() })
      })
    })
    await page.goto('/')
    await poured(page)
    await expect(page.locator('[data-k=fps]')).toHaveText('still frame')
    await page.screenshot()
    const fontsAt = await page.evaluate(() => (window as unknown as { fontsAt: number }).fontsAt)
    expect(Date.now() - fontsAt).toBeLessThan(3000)
  })
})
