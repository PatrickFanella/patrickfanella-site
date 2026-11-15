import { test, expect } from './fixtures'

test.use({ reducedMotion: 'reduce' })
test('startup steps share the page Performance clock and database counters update', async ({ page }) => {
  await page.goto('/desk/')
  await page.getByRole('button', { name: 'Run SQL benchmark' }).click()
  await expect(page.locator('section.psql')).toHaveAttribute('data-pg', 'live', { timeout: 240_000 })
  for (const step of ['fonts', 'worker', 'postgres', 'schema', 'seed', 'index', 'benchmark-seq', 'benchmark-idx']) {
    const item = page.locator(`[data-step="${step}"]`)
    await expect(item).toHaveCount(1)
    const time = Number(await item.getAttribute('data-ms'))
    const mark = await page.evaluate(name => performance.getEntriesByName(`desk:${name}`)[0]?.startTime, step)
    expect(time).toBeGreaterThan(0); expect(time).toBeCloseTo(mark, 1)
  }
  const process = page.locator('.process-stats')
  await expect(process).toContainText('50,008')
  await expect(process).toContainText(/\d+\.\d+ MiB/)
  await expect(process).toContainText('still frame')
  const queries = process.locator('dt').filter({ hasText: 'SQL statements' }).locator('+ dd')
  const initial = Number((await queries.innerText()).replaceAll(',', ''))
  await page.getByRole('textbox', { name: 'Desk command' }).fill('search world record')
  await page.getByRole('textbox', { name: 'Desk command' }).press('Enter')
  await expect.poll(async () => Number((await queries.innerText()).replaceAll(',', ''))).toBeGreaterThan(initial + 2)
})
