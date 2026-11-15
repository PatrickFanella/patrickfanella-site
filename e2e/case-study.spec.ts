import { test, expect } from './fixtures'
import AxeBuilder from '@axe-core/playwright'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const sourceFile = fileURLToPath(new URL('../src/content/case-studies/search_repository.go', import.meta.url))

test.use({ reducedMotion: 'reduce' })

test('case study preserves exact pinned lines and aligns notes without overflow', async ({ page }) => {
  const source = (await readFile(sourceFile, 'utf8')).split('\n')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/case-studies/')
  await expect(page.getByRole('heading', { name: /search request becomes/i })).toBeVisible()
  for (let number = 26; number <= 47; number++) {
    const line = page.locator(`.line[data-line="${number}"]`)
    await expect(line.locator('.line-text')).toHaveText(source[number - 1])
    await expect(line.locator('.line-number')).toHaveAttribute('href', new RegExp(`#L${number}$`))
    await expect(line).toHaveAttribute('id', `L${number}`)
  }
  await expect(page.getByText('Note: Normalize query')).toHaveCount(1)
  expect(createHash('sha256').update(await readFile(sourceFile)).digest('hex')).toBe('073e770bbd98884ad051bf7f906776f746fa0a6568c7da62142cbd4b786d10fc')
  await expect(page.locator('.line[data-line="38"] .line-number')).toHaveAttribute('href', /#L38$/)
  await page.evaluate(() => document.fonts.ready)
  const normalizeRow = page.locator('.excerpt-row[data-note="normalize-query"]')
  const codeBox = await normalizeRow.locator('.source').boundingBox()
  const noteBox = await normalizeRow.locator('.note').boundingBox()
  expect(codeBox && noteBox && noteBox.x).toBeGreaterThan(codeBox?.x ?? 0)
  expect(await page.locator('html').evaluate((el) => el.scrollWidth)).toBe(1440)
  for (const row of await page.locator('.excerpt-row[data-note]').all()) {
    const note = await row.locator('.note').boundingBox()
    const line = await row.locator('[style*="anchor-name"]').boundingBox()
    if (await row.evaluate(el => el.classList.contains('anchored'))) expect(Math.abs(note!.y - line!.y)).toBeLessThan(2)
    const bounds = await row.boundingBox()
    expect(note!.y + note!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1)
  }
  await page.screenshot({ path: test.info().outputPath('case-study-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('html').evaluate((el) => el.scrollWidth)).resolves.toBe(390)
  for (const row of await page.locator('.excerpt-row[data-note]').all()) {
    const code = await row.locator('.source').boundingBox()
    const note = await row.locator('.note').boundingBox()
    expect(code && note && note.y).toBeGreaterThan(code?.y ?? 0)
  }
  await expect(page.locator('.note').first()).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('case-study-phone.png'), fullPage: true })
})

for (const colorScheme of ['light', 'dark'] as const) test(`case study passes axe in ${colorScheme}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme })
  await page.goto('/case-studies/')
  expect((await new AxeBuilder({ page }).analyze()).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.failureSummary) }))).toEqual([])
})

test('case study remains readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.goto('/case-studies/')
  for (const row of await page.locator('.excerpt-row[data-note]').all()) {
    const code = await row.locator('.source').boundingBox(), note = await row.locator('.note').boundingBox()
    expect(note!.x).toBeGreaterThan(code!.x)
    expect(Math.abs(note!.y - code!.y)).toBeLessThan(2)
  }
  await context.close()
})
