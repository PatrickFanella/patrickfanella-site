import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures'

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
    // Count animation frames: the main thread stays free while the worker seeds and queries.
    await page.addInitScript(() => {
      const w = window as unknown as { frames_: number }
      w.frames_ = 0
      const tick = () => { w.frames_++; requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    })
    await page.goto('/desk/')
    await expect(page.locator(psql)).toHaveAttribute('data-pg', 'starting')
    await expect(page.locator('[data-pg-cap]')).toHaveText("Recorded on Clpr's demo, 14 Nov 2026")
    await expect(page.locator('[data-pg-seq]')).toHaveText('14.55')
    await expect(page.locator('[data-pg-idx]')).toHaveText('3.50')
    await expect(page.locator('[data-pg-note]')).toContainText("Until it answers, these are Clpr's recorded times.")

    const before = await page.evaluate(() => (window as unknown as { frames_: number }).frames_)
    release()
    await expect(page.locator(psql)).toHaveAttribute('data-pg', 'live', { timeout: 240_000 })
    const during = await page.evaluate(() => (window as unknown as { frames_: number }).frames_) - before
    expect(during).toBeGreaterThan(5)

    await expect(page.locator('[data-pg-cap]')).toHaveText('Measured in this tab, median of 3 runs')
    await expect(page.locator('[data-pg-seq]')).toHaveText(/^\d+\.\d\d$/)
    await expect(page.locator('[data-pg-idx]')).toHaveText(/^\d+\.\d\d$/)
    await expect(page.locator('[data-pg-seq-note]')).toHaveText('seq scan, 50,008 rows')
    await expect(page.locator('[data-pg-sub]')).toHaveText(/^live in this tab, PostgreSQL \d+\.\d+/)
    const out = page.locator('.psql-out')
    await expect(out).toContainText('Execution Time:')
    await expect(out).toContainText('idx_clips_search_vector')
    await expect(out).toContainText('speedrun world record attempt')
    await expect(out).toContainText('chat reacts to the world record')
    await expect(out).toContainText('(2 rows of 50,008 generated clips)')
    await expect(out).not.toContainText('recorded')

    const { violations } = await new AxeBuilder({ page }).include(psql).analyze()
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  test('keeps the recorded run when the worker cannot start', async ({ page, errors }) => {
    await page.route('**/pg.worker-*.js', (route) => route.abort())
    await page.goto('/desk/')
    await expect(page.locator(psql)).toHaveAttribute('data-pg', 'failed')
    await expect(page.locator('[data-pg-cap]')).toHaveText("Recorded on Clpr's demo, 14 Nov 2026")
    await expect(page.locator('[data-pg-seq]')).toHaveText('14.55')
    await expect(page.locator('[data-pg-seq-note]')).toHaveText('seq scan, 30,008 rows')
    await expect(page.locator('[data-pg-idx]')).toHaveText('3.50')
    await expect(page.locator('[data-pg-note]')).toHaveText("PostgreSQL could not start in this tab, so these are Clpr's recorded times.")
    await expect(page.locator('.psql-out')).toContainText('Execution Time: 3.495 ms')
    await expect(page.locator('.psql-out')).toContainText('PostgreSQL could not start in this tab.')
    // The blocked request is the point of this test; any other console error still fails it.
    errors.splice(0, errors.length, ...errors.filter((e) => !/Failed to load resource/.test(e)))
  })
})
