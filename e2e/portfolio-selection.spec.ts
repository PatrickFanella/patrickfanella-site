import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures'

const studies = ['clpr', 'clustr', 'rekolekt', 'undertow']
test.use({ reducedMotion: 'reduce' })

test('four source-backed product stories are complete and navigable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto('/case-studies/')
  await expect(page.locator('.project-list article')).toHaveCount(4)
  for (const slug of studies) {
    await page.goto(`/case-studies/${slug}/`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.locator('.product-study figure')).toHaveCount(2)
    await expect(page.getByRole('heading', { name: 'Evidence and limits', exact: true })).toBeVisible()
    await expect(page.locator('.product-study')).toContainText('November 16, 2026')
    for (const link of await page.locator('.study-contents a').all()) {
      const href = (await link.getAttribute('href'))!
      await link.click()
      await expect(page.locator(href)).toBeVisible()
    }
    for (const link of await page.locator('.study-sources a[href^="https://github.com/"]').all()) {
      expect(await link.getAttribute('href')).toMatch(/\/blob\/[a-f0-9]{40}\//)
    }
    for (const image of await page.locator('.product-study figure img').all()) {
      await expect(image).toHaveAttribute('alt', /.+/)
      await expect(image).toHaveAttribute('src', /2026-11-16-/)
    }
    expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBe(390)
  }
  await context.close()
})

for (const colorScheme of ['light', 'dark'] as const) test(`product stories fit enlarged phone text and pass axe in ${colorScheme}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme })
  for (const slug of studies) {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/case-studies/${slug}/`)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.evaluate(() => document.documentElement.style.fontSize = '200%')
    await page.setViewportSize({ width: 320, height: 740 })
    expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBe(320)
    await expect(page.getByRole('navigation', { name: 'Main', exact: true })).toBeVisible()
  }
})

test('the sitemap curates discovery while historical project links still resolve', async ({ page }) => {
  const sitemap = await (await page.request.get('/sitemap.xml')).text()
  for (const slug of studies) expect(sitemap).toContain(`/case-studies/${slug}/`)
  expect(sitemap).toContain('/projects/pult/')
  expect(sitemap).toContain('/projects/stupen/')
  expect(sitemap).not.toContain('/projects/blacktower/')
  for (const slug of ['blacktower', 'subcorp']) {
    await page.goto(`/projects/${slug}/`)
    await expect(page.locator('.project-detail')).toContainText('Historical project entry')
    await expect(page.getByRole('link', { name: 'All projects', exact: true })).toHaveAttribute('href', '/projects/')
  }
})
