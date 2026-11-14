import { test, expect, poured } from './fixtures'

// Pretend the browser has no WebGL2, the way an old or locked-down browser would.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
      return id === 'webgl2' ? null : (get as (...a: unknown[]) => RenderingContext | null).call(this, id, ...rest)
    } as typeof get
  })
})

for (const path of ['/', '/motion/']) {
  test(`${path} shows the static wash and all its text without WebGL2`, async ({ page }) => {
    await page.goto(path)
    await poured(page)
    await expect(page.locator('html')).toHaveClass(/\bno-ink\b/)
    await expect(page.locator('#ink')).toBeHidden()
    const wash = await page.evaluate(() => getComputedStyle(document.body).backgroundImage)
    expect(wash.match(/radial-gradient/g)).toHaveLength(3)
    // Every letter of the poured word is in place and visible.
    for (const l of await page.locator('[data-pour-in] [data-ink-letter]').all()) await expect(l).toBeVisible()
    // Every visible block of text outside closed details is rendered with a size and not hidden.
    const hidden = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('main h1, main h2, main p, main summary, footer p, footer a, header a')]
      .filter((el) => !el.closest('details:not([open]) > :not(summary)'))
      .filter((el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width === 0 || r.height === 0 || cs.visibility !== 'visible' || +cs.opacity === 0 })
      .map((el) => el.textContent?.trim()))
    expect(hidden).toEqual([])
  })
}
