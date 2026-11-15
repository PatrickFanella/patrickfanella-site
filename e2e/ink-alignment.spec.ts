import { test, expect, poured } from './fixtures'

// Headless Chromium normally hides scrollbars, which concealed the coordinate mismatch.
test.use({ launchOptions: {
  ignoreDefaultArgs: ['--hide-scrollbars'],
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=OverlayScrollbar'],
} })

test('the letter mask stays aligned when a classic scrollbar appears and disappears', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { maskDrift: number[] }
    w.maskDrift = []
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y) {
      const canvas = document.querySelector('#ink')
      // The solid glyph pass draws into the offscreen mask. Project its actual draw coordinates
      // through the displayed ink canvas; they must land at the same CSS point as the letters.
      if (canvas && !this.canvas.isConnected && this.globalCompositeOperation === 'lighter') {
        const r = canvas.getBoundingClientRect()
        const p = this.getTransform().transformPoint(new DOMPoint(x, y))
        w.maskDrift.push(Math.hypot(r.left + p.x / this.canvas.width * r.width - x,
          r.top + p.y / this.canvas.height * r.height - y))
      }
      fillText.call(this, text, x, y)
    }
  })
  await page.goto('/?ink=webgl2')
  await poured(page)
  for (const overflow of ['auto', 'hidden', 'auto']) {
    await page.evaluate((value) => {
      (window as unknown as { maskDrift: number[] }).maskDrift = []
      document.documentElement.style.overflowY = value
      // Scroll also invalidates the mask when the initial overflow value has not changed.
      window.scrollBy(0, 1)
    }, overflow)
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { maskDrift: number[] }).maskDrift.length)).toBeGreaterThan(0)
    const { drift, gutter, horizontalOverflow } = await page.evaluate(() => ({
      drift: Math.max(...(window as unknown as { maskDrift: number[] }).maskDrift),
      gutter: innerWidth - document.documentElement.clientWidth,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))
    if (overflow === 'auto') expect(gutter, 'the test must exercise a real scrollbar gutter').toBeGreaterThan(0)
    else expect(gutter).toBe(0)
    expect(horizontalOverflow).toBe(0)
    expect(drift, `mask-to-letter displacement with overflow-y: ${overflow}, in CSS px`).toBeLessThan(0.5)
  }
})
