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
    // toBeVisible ignores opacity, so check it here. checkVisibility with opacityProperty also
    // catches opacity 0 on an ancestor.
    const shown = { opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }
    // Every letter of the poured word has landed, rests where it belongs, and shows at full opacity.
    // The pour animation fills forwards, so a landed letter's transform is the identity matrix.
    const letters = page.locator('[data-pour-in] [data-ink-letter]')
    expect(await letters.count()).toBeGreaterThan(0)
    const off = await letters.evaluateAll((ls, o) => ls.filter((l) => {
      let solid = true
      for (let e: Element | null = l; e; e = e.parentElement) if (+getComputedStyle(e).opacity !== 1) solid = false
      return !l.classList.contains('landed') || !new DOMMatrixReadOnly(getComputedStyle(l).transform).isIdentity || !solid || !l.checkVisibility(o)
    }).map((l) => l.textContent), shown)
    expect(off).toEqual([])
    // Every block of text outside closed details is rendered with a size and not hidden.
    const hidden = await page.evaluate((o) => [...document.querySelectorAll<HTMLElement>('main h1, main h2, main p, main summary, footer p, footer a, header a')]
      .filter((el) => !el.closest('details:not([open]) > :not(summary)'))
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width === 0 || r.height === 0 || !el.checkVisibility(o) })
      .map((el) => el.textContent?.trim()), shown)
    expect(hidden).toEqual([])
  })
}
