import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { measured } from '../src/desk/psql'

// The desk shares boot.ts with the other pages, so a markup change on one page can break it
// without a merge conflict. These run it the same way as / and /motion/.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`desk, ${colorScheme} theme`, () => {
    test.use({ colorScheme })

    test('loads without errors and passes axe', async ({ page }) => {
      await page.goto('/desk/')
      // The name arrives in place on the desk, so every letter is landed straight away.
      await expect(page.locator('#name [data-ink-letter].landed')).toHaveCount(14)
      await expect(page.locator('[data-theme-switch]')).toHaveAccessibleName(colorScheme === 'dark' ? 'Theme: Dark' : 'Theme: Light')
      await expect(page.locator('[data-pane]')).toHaveCount(5)
      // Contrast is measured after the existing tile entrance, not against its transparent frames.
      for (const pane of await page.locator('.pane').all()) await expect(pane).toHaveCSS('opacity', '1')
      const { violations } = await new AxeBuilder({ page }).analyze()
      expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([])
    })
  })
}

test('Alt+3 moves focus to the third pane', async ({ page }) => {
  await page.goto('/desk/')
  await page.keyboard.press('Alt+Digit3')
  await expect(page.locator('[data-pane="3"]')).toBeFocused()
})

// PostgreSQL runs in a worker. Under SwiftShader on a two-core runner the ink competes with it for
// the CPU, so starting PostgreSQL and loading 50,008 rows can take minutes there.
test.describe('PostgreSQL on the desk', () => {
  const psql = '[data-pane="3"]'

  test('times the search in this tab while the ink keeps drawing', async ({ page }) => {
    // Hold the worker script back, so the recorded run can be checked before PostgreSQL answers.
    let release!: () => void
    const held = new Promise<void>((r) => { release = r })
    await page.route('**/pg.worker-*.js', async (route) => { await held; await route.continue() })
    // Record the longest main-thread task and the longest gap between animation frames. PostgreSQL on
    // the main thread runs its seed as one task lasting seconds; in the worker no task gets near that.
    // Frame gaps alone cannot tell the two apart on a two-core runner: while the worker compiles
    // PGlite, SwiftShader's compositor waits about 2 s for a core with no main-thread task over 50 ms.
    // The ink's own start-up also stalls for seconds under SwiftShader, so `quiet_` marks the last
    // frame after a gap of 1 s or more.
    await page.addInitScript(() => {
      const w = window as unknown as { gap_: number; quiet_: number; last_: number; long_: number }
      w.gap_ = 0; w.long_ = 0; w.quiet_ = w.last_ = performance.now()
      new PerformanceObserver((l) => { for (const e of l.getEntries()) w.long_ = Math.max(w.long_, e.duration) }).observe({ type: 'longtask' })
      const tick = (now: number) => {
        const d = now - w.last_; w.last_ = now
        w.gap_ = Math.max(w.gap_, d)
        if (d >= 1000) w.quiet_ = now
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.goto('/desk/')
    await page.getByRole('button', { name: 'Run SQL benchmark' }).click()
    await expect(page.locator(psql)).toHaveAttribute('data-pg', 'starting')
    await expect(page.locator('[data-pg-cap]')).toHaveText("Recorded on Clpr's demo, 14 Nov 2026")
    await expect(page.locator('[data-pg-seq]')).toHaveText('14.55')
    await expect(page.locator('[data-pg-idx]')).toHaveText('3.50')
    await expect(page.locator('[data-pg-note]')).toContainText("Until it answers, these are Clpr's recorded times.")

    // Release the worker once the ink has drawn for 4 s without a 1 s stall, so start-up is not counted.
    // Poll on a timer, not on frames, so a stall in progress counts too.
    await page.waitForFunction(() => {
      const w = window as unknown as { quiet_: number; last_: number }, now = performance.now()
      return now - w.quiet_ >= 4000 && now - w.last_ < 1000
    }, null, { timeout: 120_000, polling: 100 })
    await page.evaluate(() => { const w = window as unknown as { gap_: number; long_: number }; w.gap_ = 0; w.long_ = 0 })
    release()
    await expect(page.locator(psql)).toHaveAttribute('data-pg', 'live', { timeout: 240_000 })
    const { gap, long } = await page.evaluate(() => { const w = window as unknown as { gap_: number; long_: number }; return { gap: w.gap_, long: w.long_ } })
    expect(long, 'longest main-thread task while PostgreSQL started, in ms').toBeLessThan(1000)
    expect(gap, 'longest frame gap while PostgreSQL started, in ms').toBeLessThan(5000)

    await expect(page.locator('[data-pg-cap]')).toHaveText('Measured in this tab, median of 3 batches')
    await expect(page.locator('[data-clpr-status]')).toContainText('SQL benchmark complete')
    await expect(page.locator('[data-clpr-status]')).not.toContainText('Running')
    // Decimals follow the clock: two in Chromium for a batch of several runs, fewer for a single slow run.
    await expect(page.locator('[data-pg-seq]')).toHaveText(/^\d+(\.\d{1,2})?$/)
    await expect(page.locator('[data-pg-idx]')).toHaveText(/^(< )?\d+(\.\d{1,2})?$/)
    await expect(page.locator('[data-pg-note]')).toContainText("This tab's clock ticks every")
    // Each figure is the middle of its three batch means, shown at the clock's resolution.
    const step = Number(await page.locator('.bench').getAttribute('data-step'))
    const shown: Record<string, string> = {}
    for (const kind of ['seq', 'idx']) {
      const fig = page.locator(`[data-pg-${kind}]`)
      const batches = (await fig.getAttribute('data-batches'))!.split(' ').map(Number)
      expect(batches, `${kind} batch means`).toHaveLength(3)
      const mid = [...batches].sort((a, b) => a - b)[1]
      shown[kind] = measured(mid, step, Number(await fig.getAttribute('data-runs'))).text
      await expect(fig).toHaveText(shown[kind])
    }
    await expect(page.locator('[data-pg-seq-note]')).toHaveText('seq scan, 50,008 rows')
    await expect(page.locator('[data-pg-sub]')).toHaveText(/^live in this tab, PostgreSQL \d+\.\d+/)
    const out = page.locator('.psql-out')
    // The session's Execution Time is the same batch mean as the panel's, not one run's coarse reading.
    await expect(out).toContainText(`Execution Time: ${shown.idx} ms (mean of `)
    await expect(out).not.toContainText(/0\.000 ms|actual time=/)
    await expect(out).toContainText('idx_clips_search_vector')
    await expect(out).toContainText('speedrun world record attempt')
    await expect(out).toContainText('chat reacts to the world record')
    await expect(out).toContainText('(2 rows of 50,008 generated clips)')
    await expect(out).not.toContainText('recorded')

    const { violations } = await new AxeBuilder({ page }).include(psql).analyze()
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  test('keeps waiting for a slow download and still measures the search', async ({ page }) => {
    // A slow link: PGlite's WebAssembly is still downloading when the pane stops saying "starting".
    // The fake clock jumps the page past that mark; the worker keeps real time.
    let release!: () => void
    const held = new Promise<void>((r) => { release = r })
    await page.route('**/pglite-*.wasm', async (route) => { await held; await route.continue() })
    await page.clock.install()
    await page.goto('/desk/')
    await page.getByRole('button', { name: 'Run SQL benchmark' }).click()
    await expect(page.locator(psql)).toHaveAttribute('data-pg', 'starting')
    await page.clock.fastForward('02:05')
    await expect(page.locator(psql)).toHaveAttribute('data-pg', 'slow')
    await expect(page.locator('[data-pg-note]')).toHaveText("PostgreSQL is still loading in this tab. Until it answers, these are Clpr's recorded times.")
    await expect(page.locator('[data-pg-seq]')).toHaveText('14.55')
    await expect(page.locator('.psql-out')).toContainText('PostgreSQL is still loading in this tab.')
    release()
    await expect(page.locator(psql)).toHaveAttribute('data-pg', 'live', { timeout: 240_000 })
    await expect(page.locator('[data-pg-cap]')).toHaveText('Measured in this tab, median of 3 batches')
  })

  /** The pane fell back to the recorded run and says PostgreSQL could not start. */
  async function fellBack(page: Page) {
    await expect(page.locator(psql)).toHaveAttribute('data-pg', 'failed', { timeout: 120_000 })
    await expect(page.locator('[data-pg-cap]')).toHaveText("Recorded on Clpr's demo, 14 Nov 2026")
    await expect(page.locator('[data-pg-seq]')).toHaveText('14.55')
    await expect(page.locator('[data-pg-seq-note]')).toHaveText('seq scan, 30,008 rows')
    await expect(page.locator('[data-pg-idx]')).toHaveText('3.50')
    await expect(page.locator('[data-pg-note]')).toHaveText("PostgreSQL could not start in this tab, so these are Clpr's recorded times.")
    await expect(page.locator('.psql-out')).toContainText('Execution Time: 3.495 ms')
    await expect(page.locator('.psql-out')).toContainText('PostgreSQL could not start in this tab.')
  }

  test('keeps the recorded run when the worker cannot start', async ({ page, errors }) => {
    await page.route('**/pg.worker-*.js', (route) => route.abort())
    await page.goto('/desk/')
    await page.getByRole('button', { name: 'Run SQL benchmark' }).click()
    await fellBack(page)
    // The blocked request is the point of this test; any other console error still fails it.
    errors.splice(0, errors.length, ...errors.filter((e) => !/Failed to load resource/.test(e)))
  })

  // These two fail inside the worker, where Emscripten's rejection never reaches Worker.onerror.
  test("keeps the recorded run when PGlite's WebAssembly is missing", async ({ page, errors }) => {
    await page.route('**/pglite-*.wasm', (route) => route.fulfill({ status: 404, body: 'not found' }))
    await page.goto('/desk/')
    await page.getByRole('button', { name: 'Run SQL benchmark' }).click()
    await fellBack(page)
    errors.splice(0, errors.length, ...errors.filter((e) => !/Failed to load resource|WebAssembly/.test(e)))
  })

  test("keeps the recorded run under a policy without 'wasm-unsafe-eval'", async ({ page, errors }) => {
    // The production policy the preview deploy has to avoid: scripts and workers from this origin only.
    await page.route('**/*', async (route) => {
      const res = await route.fetch()
      await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': "script-src 'self'; worker-src 'self'" } })
    })
    await page.goto('/desk/')
    await page.getByRole('button', { name: 'Run SQL benchmark' }).click()
    await fellBack(page)
    errors.splice(0, errors.length, ...errors.filter((e) => !/Content Security Policy|WebAssembly|wasm/i.test(e)))
  })
})
