import { test, expect, crawlRoutes as routes } from './fixtures'

test.use({ reducedMotion: 'reduce' })

for (const colorScheme of ['light', 'dark'] as const) test(`candidate remains readable at 200% text without graphics in ${colorScheme}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { value: undefined })
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...args: unknown[]) {
      return id === 'webgl2' ? null : (getContext as (...args: unknown[]) => RenderingContext | null).call(this, id, ...args)
    } as typeof getContext
  })
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport)
    for (const path of routes) {
      await page.goto(path)
      await expect(page.locator('html')).toHaveClass(/\bno-ink\b/)
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
      await page.evaluate(() => document.fonts.ready)
      expect.soft(await page.locator('html').evaluate(el => el.scrollWidth), `${path} ${viewport.width}`).toBe(viewport.width)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      for (const name of ['Work', 'Résumé', 'Contact']) {
        const link = page.locator('[data-site-header]').getByRole('link', { name, exact: true })
        await link.focus()
        await expect(link).toBeFocused()
      }
    }
  }
})

test('narrow content and motion pages also wrap enlarged text without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 740 } })
  const page = await context.newPage()
  for (const path of ['/projects/', '/resume/', '/contact/', '/motion/']) {
    await page.goto(path)
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    await page.evaluate(() => document.fonts.ready)
    expect(await page.locator('html').evaluate(el => el.scrollWidth), path).toBe(320)
  }
  await context.close()
})

