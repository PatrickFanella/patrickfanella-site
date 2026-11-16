import AxeBuilder from '@axe-core/playwright'
import { selectedProjects } from '../src/content/project-presentation'
import { test, expect } from './fixtures'

test('projects render the curated selection without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/projects/')
  await expect(page.locator('.project-list article')).toHaveCount(selectedProjects.length)
  for (const project of selectedProjects) {
    const item = page.locator(`article[id="${project.slug}"]`)
    await expect(item.getByRole('heading')).toHaveText(project.title)
    await expect(item).toContainText(project.summary)
    await expect(item).toContainText(project.deliveryStatus ?? 'Status not stated in source')
    await expect(item).toContainText(project.stack.join(', ') || 'Not specified in source')
  }
  await context.close()
})

for (const colorScheme of ['light', 'dark'] as const) test(`projects fit mobile and pass axe in ${colorScheme}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/projects/')
  expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBe(390)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.locator('#clpr').scrollIntoViewIfNeeded()
  await page.screenshot({ path: test.info().outputPath(`catalog-${colorScheme}-phone.png`) })
})

test('content navigation points only to published routes', async ({ page }) => {
  await page.goto('/projects/')
  for (const link of await page.locator('nav a[href^="/"]').all()) {
    const href = await link.getAttribute('href')
    const response = await page.request.get(href!)
    expect(response.status(), `Navigation destination ${href}`).toBe(200)
  }
})
