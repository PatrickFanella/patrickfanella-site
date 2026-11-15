import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { test, expect } from './fixtures'

test.use({ reducedMotion: 'reduce' })
const source = (await readFile(new URL('../src/content/case-studies/search_repository.go', import.meta.url), 'utf8')).split('\n')
const pin = '1eab1a62535e562e327fbf4b197c094e81abe619'

test('ranking study cites the exact source and separates costs and proposals without scripts', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/case-studies/clpr-search/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How Clpr ranks and pages a clip search')
  await expect(page.locator('.study-scope')).toContainText('The proposed changes below have not shipped')
  await expect(page.locator('.study-scope')).toContainText('not latency measurements')
  await expect(page.locator('main')).not.toContainText('Draft for Patrick')
  for (let number = 174; number <= 221; number++) {
    const line = page.locator(`.line[data-line="${number}"]`)
    await expect(line.locator('.line-text')).toHaveText(source[number - 1])
    await expect(line.locator('.line-number')).toHaveAttribute('href', new RegExp(`/blob/${pin}/.*#L${number}$`))
  }
  const ranges = [[174, 180], [182, 188], [190, 198], [200, 221]]
  await expect(page.locator('.note')).toHaveCount(ranges.length)
  for (const [index, [start, end]] of ranges.entries()) {
    const note = page.locator('.note').nth(index)
    await expect(note.locator('.line-label a')).toHaveAttribute('href', new RegExp(`/blob/${pin}/.*#L${start}-L${end}$`))
    await expect(note).toContainText('Cost.')
    await expect(note).toContainText('What I would change.')
  }
  await context.close()
})

for (const colorScheme of ['light', 'dark'] as const) test(`study notes fit and pass axe in ${colorScheme}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/case-studies/clpr-search/')
    await page.evaluate(() => document.fonts.ready)
    expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBe(width)
    for (const row of await page.locator('.excerpt-row[data-note]').all()) {
      const code = (await row.locator('.source').boundingBox())!
      const note = (await row.locator('.note').boundingBox())!
      const bounds = (await row.boundingBox())!
      expect(note.y + note.height).toBeLessThanOrEqual(bounds.y + bounds.height + 2)
      if (width === 390) expect(note.y).toBeGreaterThanOrEqual(code.y + code.height)
      else expect(note.x).toBeGreaterThan(code.x)
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: test.info().outputPath(`clpr-study-${colorScheme}-${width}.png`), fullPage: true })
  }
})

test('the request setup links to the complete ranking study', async ({ page }) => {
  await page.goto('/case-studies/')
  await page.getByRole('link', { name: 'How Clpr ranks and pages a clip search', exact: true }).click()
  await expect(page).toHaveURL('/case-studies/clpr-search/')
})
