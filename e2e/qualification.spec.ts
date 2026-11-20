import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { test, expect, crawlRoutes as routes } from './fixtures'

test.use({ reducedMotion: 'reduce' })

// Native tab zoom changes the browser's layout viewport; CSS zoom and text scaling do not prove it.
// https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom
// https://playwright.dev/docs/chrome-extensions
test('candidate reflows with native Chromium tab zoom set to 200%', async ({ baseURL }, info) => {
  const extension = info.outputPath('zoom-extension')
  await mkdir(extension, { recursive: true })
  await writeFile(`${extension}/manifest.json`, JSON.stringify({
    manifest_version: 3, name: 'Local candidate zoom check', version: '1.0', permissions: ['tabs'],
    background: { service_worker: 'background.js' },
  }))
  await writeFile(`${extension}/background.js`, 'chrome.runtime.onInstalled.addListener(() => {});')
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce',
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  })
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
    const page = context.pages()[0]
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(baseURL!)
    const before = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio }))
    const zoom = await worker.evaluate(async () => {
      const tabs = (globalThis as unknown as { chrome: { tabs: {
        query(query: { active: boolean }): Promise<{ id: number }[]>
        setZoom(id: number, factor: number): Promise<void>
        getZoom(id: number): Promise<number>
      } } }).chrome.tabs
      const [tab] = await tabs.query({ active: true })
      await tabs.setZoom(tab.id, 2)
      return tabs.getZoom(tab.id)
    })
    expect(zoom).toBe(2)
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(before.width / 2)
    expect(await page.evaluate(() => devicePixelRatio)).toBe(before.dpr * 2)
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme })
      for (const path of routes) {
        await page.goto(new URL(path, baseURL!).href)
        await page.evaluate(() => document.fonts.ready)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        expect(await page.locator('html').evaluate(el => el.scrollWidth), path).toBe(before.width / 2)
      }
      await page.goto(new URL('/case-studies/clpr-search/', baseURL!).href)
      await page.locator('.decision-summary a[href="#note-paging"]').focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('#note-paging')).toBeFocused()
      expect((await page.locator('#note-paging').boundingBox())!.y).toBeGreaterThanOrEqual((await page.locator('[data-site-header]').boundingBox())!.height)
    }
    expect(errors).toEqual([])
    await info.attach('Native zoom measurement', { body: JSON.stringify({ before, zoom, after: await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio })) }), contentType: 'application/json' })
  } finally {
    await context.close()
  }
})
