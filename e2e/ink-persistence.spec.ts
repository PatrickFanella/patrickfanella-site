import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

// Issue #106: on a phone the ink started over whenever the screen was touched or scrolled. A
// mobile browser resizes the window when its toolbar slides in or out during a touch scroll, and
// every resize event used to rebuild the solver's textures empty. This runs WebGL2 on SwiftShader
// in emulated mobile Chromium. Emulation has no toolbar, so the height changes are made by hand;
// the WebGPU path and real phones are not exercised.
const PHONE = { width: 390, height: 664 }
const DPR = 2
test.use({ viewport: PHONE, deviceScaleFactor: DPR, hasTouch: true, isMobile: true })

interface Probe {
  /** The share of the top 380 CSS px of the ink canvas that holds ink right now. */
  inked(): number
  /** `inked()` each time the canvas was given a new size, read before the browser painted it. */
  atResize: number[]
}

function install() {
  const inked = () => {
    const ink = document.querySelector<HTMLCanvasElement>('#ink')!
    const copy = document.createElement('canvas'); copy.width = 48; copy.height = 48
    const ctx = copy.getContext('2d', { willReadFrequently: true })!
    // Every viewport below is at least 380 px tall, so they all show this band.
    ctx.drawImage(ink, 0, 0, ink.width, ink.height * 380 / innerHeight, 0, 0, copy.width, copy.height)
    const px = ctx.getImageData(0, 0, copy.width, copy.height).data
    // The top left corner is bare ground; ink is any pixel well away from that colour.
    let n = 0
    for (let i = 0; i < px.length; i += 4) {
      if (Math.max(Math.abs(px[i] - px[0]), Math.abs(px[i + 1] - px[1]), Math.abs(px[i + 2] - px[2])) > 12) n++
    }
    return n / (copy.width * copy.height)
  }
  const atResize: number[] = [];
  (window as unknown as { inkProbe: Probe }).inkProbe = { inked, atResize }
  // The observer runs as soon as the callback that sized the canvas returns, before a paint.
  addEventListener('DOMContentLoaded', () => {
    new MutationObserver(() => atResize.push(inked()))
      .observe(document.querySelector('#ink')!, { attributes: true, attributeFilter: ['width', 'height'] })
  })
}

/** Ink coverage, read after the engine has drawn a frame. */
function inked(page: Page) {
  return page.evaluate(() => new Promise<number>((resolve) => {
    // Two frames: the first lets a queued resize run, the engine's callback then draws ahead of this one.
    requestAnimationFrame(() => requestAnimationFrame(() => resolve((window as unknown as { inkProbe: Probe }).inkProbe.inked())))
  }))
}

/** Resize the viewport and wait until the ink canvas has taken the new size. */
async function resizeTo(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.waitForFunction(({ w, h, dpr }: { w: number; h: number; dpr: number }) => {
    const ink = document.querySelector<HTMLCanvasElement>('#ink')!
    return innerWidth === w && innerHeight === h && ink.width === w * dpr && ink.height === h * dpr
  }, { w: width, h: height, dpr: DPR })
}

// The landing page, a content page and the Desk. On /motion/ the ink pours from a word further down.
for (const [path, start] of [['/', null], ['/motion/', '#demo-pour'], ['/desk/', null]] as const) {
  test(`${path} keeps its ink through a tap, a touch scroll and toolbar height changes`, async ({ page }) => {
    await page.addInitScript(install)
    await page.goto(`${path}?ink=webgl2`)
    if (start) await page.locator(start).evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await expect.poll(() => inked(page), { timeout: 120_000 }).toBeGreaterThan(0.1)

    // A reset leaves a tenth of the ink or less (measured on main: 0.32 to 0.01 on /, 0.13 to 0.015 on /desk/).
    const kept = async (what: string, act: () => Promise<unknown>, floor = 0.6) => {
      const before = await inked(page)
      await act()
      const after = await inked(page)
      expect(after / before, `share of the ink left after ${what} (${before.toFixed(3)} to ${after.toFixed(3)})`).toBeGreaterThan(floor)
    }

    // A tap on plain text or ground, not on a link or a control.
    const [tx, ty] = await page.evaluate(() => {
      for (let y = 620; y > 100; y -= 20) for (const x of [200, 100, 300, 30]) {
        if (!document.elementFromPoint(x, y)?.closest('a,button,input,summary,[data-go],[data-replay]')) return [x, y]
      }
      throw new Error('nowhere plain to tap')
    })
    await kept('a tap', () => page.touchscreen.tap(tx, ty))

    const cdp = await page.context().newCDPSession(page)
    const swipe = async (dy: number) => {
      const y0 = await page.evaluate(() => scrollY)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 400 }] })
      for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 400 + dy * i / 10 }] })
        await page.waitForTimeout(16)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      expect(Math.abs(await page.evaluate(() => scrollY) - y0), 'the swipe scrolled the page').toBeGreaterThan(40)
    }
    // Scrolling moves the page's solid shapes over the ink and pushes the water, so allow more change.
    await kept('a touch scroll down and back up', async () => { await swipe(-100); await swipe(100) }, 0.4)

    // Some browsers send a resize event when nothing the canvas depends on has changed.
    await kept('a resize event at the same size', () => page.evaluate(() => {
      // Forget the sizing at start-up.
      (window as unknown as { inkProbe: Probe }).inkProbe.atResize.length = 0
      dispatchEvent(new Event('resize'))
    }))
    expect(await page.evaluate(() => (window as unknown as { inkProbe: Probe }).inkProbe.atResize), 'the canvas is left alone when its size has not changed').toEqual([])

    // A toolbar that hides adds about 60 to 100 CSS px of height; one that shows takes it away.
    for (const height of [744, 664, 584, 664]) {
      await kept(`the viewport height changing to ${height} px`, () => resizeTo(page, PHONE.width, height))
    }
    // Sizing a canvas clears it. The ink must be drawn back before the browser paints, not a frame later.
    const before = await inked(page)
    const atResize = await page.evaluate(() => (window as unknown as { inkProbe: Probe }).inkProbe.atResize)
    expect(atResize.length, 'canvas resizes seen').toBeGreaterThanOrEqual(4)
    expect(Math.min(...atResize) / before, `ink on the canvas in the frame it was resized (${atResize.map((v) => v.toFixed(3))})`).toBeGreaterThan(0.5)

    // A real change of size, such as a rotation: the canvas still covers the viewport exactly.
    await resizeTo(page, PHONE.height, PHONE.width)
    expect(await page.evaluate(() => {
      const ink = document.querySelector<HTMLCanvasElement>('#ink')!, r = ink.getBoundingClientRect()
      return [r.left, r.top, r.width, r.height, ink.width, ink.height]
    })).toEqual([0, 0, PHONE.height, PHONE.width, PHONE.height * DPR, PHONE.width * DPR])
  })
}
