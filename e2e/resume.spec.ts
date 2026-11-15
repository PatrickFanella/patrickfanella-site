import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import resume from '../src/content/resume.json' with { type: 'json' }
import { test, expect } from './fixtures'

test.use({ reducedMotion: 'reduce' })
test('résumé matches its source, downloads the exact PDF and prints on one or two pages', async ({ page }, info) => {
  await page.goto('/resume/')
  for (const role of [...resume.roles, ...resume.otherRoles]) {
    await expect(page.getByRole('heading', { name: role.employer, exact: true })).toBeVisible()
    await expect(page.getByText(role.dates, { exact: true })).toBeVisible()
  }
  const response = await page.request.get('/assets/patrick_fanella_resume.pdf')
  expect(response.ok()).toBeTruthy()
  expect(response.headers()['content-type']).toContain('application/pdf')
  expect(createHash('sha256').update(await response.body()).digest('hex')).toBe(resume.provenance.pdfSha256)
  await expect(page.getByRole('link', { name: 'Download PDF' })).toHaveAttribute('download', 'Patrick_Fanella_Resume.pdf')
  let prints = 0
  page.on('dialog', async dialog => dialog.dismiss())
  await page.exposeFunction('recordPrint', () => { prints++ })
  await page.evaluate(() => { window.print = () => { void (window as unknown as { recordPrint: () => Promise<void> }).recordPrint() } })
  await page.getByRole('button', { name: 'Print résumé' }).click()
  await expect.poll(() => prints).toBe(1)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.bar')).toBeHidden()
  await page.evaluate(() => document.fonts.ready)
  const print = info.outputPath('resume-print.pdf')
  await writeFile(print, await page.pdf({ preferCSSPageSize: true, printBackground: true }))
  // Count actual page objects without a system PDF dependency, including Chromium's page tree.
  const pdf = (await readFile(print)).toString('latin1')
  const pages = (pdf.match(/\/Type \/Page\b/g) ?? []).length
  expect(pages).toBeGreaterThanOrEqual(1); expect(pages).toBeLessThanOrEqual(2)
  await info.attach('Print layout', { path: print, contentType: 'application/pdf' })
})

for (const colorScheme of ['light', 'dark'] as const) test(`résumé is accessible and fits a phone in ${colorScheme}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme }); await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/resume/')
  expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBe(390)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
