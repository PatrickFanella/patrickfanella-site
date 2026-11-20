import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

// Issue #106: on a phone the ink started over whenever the screen was touched or scrolled. A
// mobile browser resizes the window when its toolbar slides in or out during a touch scroll, and
// every resize event used to rebuild the solver's textures empty. This runs WebGL2 on SwiftShader
// in emulated mobile Chromium. Emulation has no toolbar, so the height changes are made by hand.
// Real phones are not exercised, and neither is the WebGPU path: headless Chromium has no WebGPU
// adapter by default, and its SwiftShader one loses the device before the first frame.
const PHONE = { width: 390, height: 664 }
const DPR = 2
test.use({ viewport: PHONE, deviceScaleFactor: DPR, hasTouch: true, isMobile: true })

interface Probe {
  /** The share of the top 380 CSS px of the ink canvas, from `fromX` CSS px rightwards, that holds ink right now. */
  inked(fromX?: number): number
  /** How far down that band the ink sits on average, in CSS px. */
  depth(): number
  /** The share of the whole canvas that holds ink right now. */
  whole(): number
  /** `inked()` each time the canvas was given a new size, read before the browser painted it. */
  atResize: number[]
  /** `depth()` at the same moments. */
  depthAtResize: number[]
}

function install() {
  const BAND = 380, N = 48
  // The ink pixels of the band, and the sum of their rows, on an N by N copy.
  const read = (fromX = 0, band = BAND) => {
    const ink = document.querySelector<HTMLCanvasElement>('#ink')!
    const copy = document.createElement('canvas'); copy.width = N; copy.height = N
    const ctx = copy.getContext('2d', { willReadFrequently: true })!
    // Every viewport below is at least 380 px tall, so they all show this band.
    const x0 = ink.width * fromX / innerWidth
    ctx.drawImage(ink, x0, 0, ink.width - x0, ink.height * band / innerHeight, 0, 0, N, N)
    const px = ctx.getImageData(0, 0, N, N).data
    // The ground is flat; take its colour from the top left corner of the whole canvas.
    const one = document.createElement('canvas'); one.width = 1; one.height = 1
    const octx = one.getContext('2d', { willReadFrequently: true })!
    octx.drawImage(ink, 0, 0, 2, 2, 0, 0, 1, 1)
    const g = octx.getImageData(0, 0, 1, 1).data
    let n = 0, rows = 0
    for (let i = 0; i < px.length; i += 4) {
      if (Math.max(Math.abs(px[i] - g[0]), Math.abs(px[i + 1] - g[1]), Math.abs(px[i + 2] - g[2])) > 12) { n++; rows += Math.floor(i / 4 / N) + 0.5 }
    }
    return { n, rows }
  }
  const inked = (fromX = 0) => read(fromX).n / (N * N)
  const depth = () => { const { n, rows } = read(); return n ? rows / n * BAND / N : -1 }
  const whole = () => read(0, innerHeight).n / (N * N)
  const atResize: number[] = [], depthAtResize: number[] = [];
  (window as unknown as { inkProbe: Probe }).inkProbe = { inked, depth, whole, atResize, depthAtResize }
  // The observer runs as soon as the callback that sized the canvas returns, before a paint.
  addEventListener('DOMContentLoaded', () => {
    new MutationObserver(() => { atResize.push(inked()); depthAtResize.push(depth()) })
      .observe(document.querySelector('#ink')!, { attributes: true, attributeFilter: ['width', 'height'] })
  })
}

/** Ink coverage, read after the engine has drawn a frame. */
function inked(page: Page, fromX = 0) {
  return page.evaluate((x) => new Promise<number>((resolve) => {
    // Two frames: the first lets a queued resize run, the engine's callback then draws ahead of this one.
    requestAnimationFrame(() => requestAnimationFrame(() => resolve((window as unknown as { inkProbe: Probe }).inkProbe.inked(x))))
  }), fromX)
}

/** Ink coverage of the whole canvas, read after the engine has drawn a frame. */
function wholeInk(page: Page) {
  return page.evaluate(() => new Promise<number>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve((window as unknown as { inkProbe: Probe }).inkProbe.whole())))
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
    // Only a start gate: enough ink for the ratios below to mean something. Once poured, the band
    // holds 0.07 to 0.23 here, and /desk/ and /motion/ dip under 0.1 as the ink drifts.
    await expect.poll(() => inked(page), { timeout: 120_000 }).toBeGreaterThan(0.05)

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
      // The scroll is applied off the main thread and reaches scrollY a frame or more later.
      await expect.poll(() => page.evaluate((y) => Math.abs(scrollY - y), y0), 'how far the swipe scrolled the page').toBeGreaterThan(40)
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
    // The ink is anchored at the top left: it must not move down or up the screen with the bottom
    // edge, which would shift it by the whole 80 px. Read in the frame of the resize, it has had
    // only a step or two to flow.
    const wholeBefore = await wholeInk(page)
    for (const height of [744, 664, 584, 664]) {
      let was = 0
      await kept(`the viewport height changing to ${height} px`, async () => {
        // Read in a frame, after the engine's draw: a WebGL canvas is blank once it has been shown.
        was = await page.evaluate(() => new Promise<number>((resolve) => {
          requestAnimationFrame(() => resolve((window as unknown as { inkProbe: Probe }).inkProbe.depth()))
        }))
        await resizeTo(page, PHONE.width, height)
      })
      const now = await page.evaluate(() => (window as unknown as { inkProbe: Probe }).inkProbe.depthAtResize.at(-1)!)
      expect(Math.abs(now - was), `how far the ink moved on screen when the height changed to ${height} px (${was.toFixed(1)} to ${now.toFixed(1)} px down)`).toBeLessThan(40)
    }
    // The band above cannot see the bottom of the canvas, where each smaller height cuts ink off
    // and each larger one adds bare ground for the pour to fill. Over the whole canvas, back at the
    // first height, most of the ink must still be there (0.69 to 0.81 of it here; a reset leaves a tenth).
    const wholeAfter = await wholeInk(page)
    expect(wholeAfter / wholeBefore, `share of the whole canvas's ink left after the toolbar cycle (${wholeBefore.toFixed(3)} to ${wholeAfter.toFixed(3)})`).toBeGreaterThan(0.35)
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

/**
 * Ink coverage of a viewport rectangle in CSS px, counted on a screenshot with the page's content
 * hidden. A still is drawn once, and a WebGL canvas cannot be read back after it has been shown.
 */
async function shotInk(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  const png = (await page.screenshot({ clip, scale: 'css' })).toString('base64')
  // Bare ground, under the header.
  const corner = (await page.screenshot({ clip: { x: 0, y: 0, width: 2, height: 2 }, scale: 'css' })).toString('base64')
  const counter = await page.context().newPage()
  try {
    return await counter.evaluate(async ([a, b]) => {
      const px = async (b64: string) => {
        const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
        const c = new OffscreenCanvas(bmp.width, bmp.height), ctx = c.getContext('2d')!
        ctx.drawImage(bmp, 0, 0)
        return ctx.getImageData(0, 0, bmp.width, bmp.height).data
      }
      const d = await px(a), g = await px(b)
      let n = 0
      for (let i = 0; i < d.length; i += 4) {
        if (Math.max(Math.abs(d[i] - g[0]), Math.abs(d[i + 1] - g[1]), Math.abs(d[i + 2] - g[2])) > 12) n++
      }
      return n / (d.length / 4)
    }, [png, corner])
  } finally { await counter.close() }
}

// With reduced motion the page shows one still and the solver never steps again by itself. After a
// real change of size the still is made again for the new layout, as a load at that size would.
test('a reduced-motion still is made again after a rotation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?ink=webgl2')
  await page.addStyleTag({ content: 'body *:not(#ink) { visibility: hidden !important }' })
  // The strip under the feet of the name, where its letters pour.
  const feet = () => page.evaluate(() => {
    const r = [...document.querySelectorAll('[data-ink-letter]')].map((el) => el.getBoundingClientRect())
    const x = Math.min(...r.map((q) => q.left)), bottom = Math.max(...r.map((q) => q.bottom))
    return { x, y: bottom - 4, width: Math.max(...r.map((q) => q.right)) - x, height: 24 }
  })
  const upright = await feet()
  await expect.poll(() => shotInk(page, upright), { timeout: 120_000 }).toBeGreaterThan(0.1)

  await page.setViewportSize({ width: PHONE.height, height: PHONE.width })
  await expect.poll(async () => (await feet()).y).not.toBe(upright.y)
  const turned = await feet()
  expect(Math.abs(turned.y - upright.y), 'the name moved when the page turned').toBeGreaterThan(40)
  await expect.poll(() => shotInk(page, turned), { message: 'ink under the name where it now stands', timeout: 60_000 }).toBeGreaterThan(0.1)
  expect(await shotInk(page, upright), 'ink left where the name used to stand').toBeLessThan(0.02)
})

// A phone's toolbar showing and hiding changes the height by 120 px or less, which keeps the
// carried still. Showing cuts the bottom off it, and the still is not stepped again, so when the
// toolbar hid again the strip stayed bare for good. The viewport here is short enough for a
// toolbar to cut it just under the feet of the name, where there is ink however few steps the
// still's time budget allowed.
test('a reduced-motion still is made again when a toolbar hiding uncovers bare ground', async ({ page }) => {
  const TALL = 220
  await page.setViewportSize({ width: PHONE.width, height: TALL })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?ink=webgl2')
  await page.addStyleTag({ content: 'body *:not(#ink) { visibility: hidden !important }' })
  const feet = () => page.evaluate(() => {
    const r = [...document.querySelectorAll('[data-ink-letter]')].map((el) => el.getBoundingClientRect())
    const x = Math.min(...r.map((q) => q.left))
    return { x, bottom: Math.max(...r.map((q) => q.bottom)), width: Math.max(...r.map((q) => q.right)) - x }
  })
  // The 22 px that start 3 px under the name. The name's size settles with its font, so poll.
  // A loaded machine fits few steps into the still, so the floors are low; bare ground reads 0.
  const under = async () => { const f = await feet(); return { x: f.x, y: Math.round(f.bottom) + 3, width: f.width, height: 22 } }
  await expect.poll(async () => shotInk(page, await under()), { message: 'ink under the feet of the name in the first still', timeout: 120_000 }).toBeGreaterThan(0.03)
  const strip = await under(), short = strip.y - 2
  expect(TALL - short, 'px of height the toolbar takes: a change small enough to keep the still').toBeGreaterThan(20)
  expect(TALL - short).toBeLessThanOrEqual(120)

  // The toolbar shows: the viewport now ends just above the strip.
  await page.setViewportSize({ width: PHONE.width, height: short })
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLCanvasElement>('#ink')!.height)).toBe(short * DPR)
  // It hides again: the strip that was cut off has ink again.
  await page.setViewportSize({ width: PHONE.width, height: TALL })
  await expect.poll(() => shotInk(page, strip), { message: 'ink in the strip the toolbar uncovered', timeout: 60_000 }).toBeGreaterThan(0.03)
})

// A frame that is not displayed has a viewport of 0 by 0. The site may not be framed, so the
// test reports that size itself until it is told to stop. The page's own layout is not what is
// under test, so ink is asked for with a press on a button that splashes.
test('a page that loads with no viewport starts its ink once it has one', async ({ page }) => {
  await page.addInitScript(install)
  await page.addInitScript(() => {
    const w = window as unknown as { hasViewport: boolean }
    for (const key of ['innerWidth', 'innerHeight'] as const) {
      const real = Object.getOwnPropertyDescriptor(window, key)!.get!
      Object.defineProperty(window, key, { configurable: true, get: () => w.hasViewport ? real.call(window) : 0 })
    }
  })
  await page.goto('/motion/?ink=webgl2')
  expect(await page.evaluate(() => [innerWidth, innerHeight])).toEqual([0, 0])
  // The page pours its word once the engine's `ready` settles: with no viewport that is when the
  // solver exists but has no grids (and, before the fix, when it had failed on grids it never laid
  // out). Wait for the first letter to land, however long start-up takes, so that the resize
  // below is the late start and not the solver's ordinary one.
  await expect(page.locator('#demo-pour [data-pour]').first()).toBeAttached({ timeout: 120_000 })
  expect(await page.evaluate(() => [innerWidth, innerHeight, document.querySelector<HTMLCanvasElement>('#ink')!.width])).toEqual([0, 0, 300])
  await page.evaluate(() => { (window as unknown as { hasViewport: boolean }).hasViewport = true; dispatchEvent(new Event('resize')) })
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLCanvasElement>('#ink')!.width)).toBe(PHONE.width * DPR)
  // Put the button inside the band that `inked` reads, and press it where it is.
  const [x, y] = await page.getByRole('button', { name: 'Press me' }).evaluate((el) => {
    scrollBy(0, el.getBoundingClientRect().top - 150)
    const r = el.getBoundingClientRect()
    return [r.left + r.width / 2, r.top + r.height / 2]
  })
  await expect.poll(async () => { await page.touchscreen.tap(x, y); return inked(page) }, { timeout: 120_000 }).toBeGreaterThan(0.02)
  expect(await page.evaluate(() => document.documentElement.classList.contains('no-ink'))).toBe(false)
})
