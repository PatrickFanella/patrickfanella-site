import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import resume from '../src/content/resume.json' with { type: 'json' }
import artifact from '../src/content/resume-artifact.json' with { type: 'json' }
import { test, expect } from './fixtures'

test.use({ reducedMotion: 'reduce' })
test('résumé matches its source, downloads the exact PDF and prints on one page', async ({ page }, info) => {
  await page.goto('/resume/')
  for (const role of [...resume.roles, ...resume.otherRoles]) {
    await expect(page.getByRole('heading', { name: role.employer, exact: true })).toBeVisible()
    await expect(page.getByText(role.dates, { exact: true })).toBeVisible()
  }
  const response = await page.request.get('/assets/patrick_fanella_resume.pdf')
  expect(response.ok()).toBeTruthy()
  expect(response.headers()['content-type']).toContain('application/pdf')
  expect(createHash('sha256').update(await response.body()).digest('hex')).toBe(artifact.sha256)
  await expect(page.getByRole('link', { name: 'Download PDF' })).toHaveAttribute('download', 'Patrick_Fanella_Resume.pdf')
  const downloading = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download PDF' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe(artifact.filename)
  const downloaded = (await download.path())!
  expect(createHash('sha256').update(await readFile(downloaded)).digest('hex')).toBe(artifact.sha256)
  expect(artifact.importedSource.pdfSha256).toBe(resume.provenance.pdfSha256)
  expect(artifact.sha256).not.toBe(resume.provenance.pdfSha256)
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
  expect(pages).toBe(1)
  await info.attach('Print layout', { path: print, contentType: 'application/pdf' })
})

for (const colorScheme of ['light', 'dark'] as const) test(`résumé is accessible and fits a phone in ${colorScheme}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme }); await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/resume/')
  expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBe(390)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})


test('recruiting links agree across page types without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  for (const path of ['/', '/contact/', '/resume/', '/projects/', '/projects/clpr/', '/case-studies/clpr-search/', '/desk/', '/motion/']) {
    await page.goto(path)
    const links = page.locator('a[href^="mailto:"]')
    expect(await links.count(), path).toBeGreaterThan(0)
    for (const link of await links.all()) await expect(link).toHaveAttribute('href', `mailto:${resume.email}`)
  }
  await context.close()
})

test('supported DeliverZero outcome precedes skills and links to source experience without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 740 } })
  const page = await context.newPage()
  await page.goto('/resume/')
  const impact = page.getByRole('region', { name: 'Employment impact' })
  await expect(impact).toContainText(resume.deliverzero_bullets[1])
  expect(await impact.evaluate(el => !!(el.compareDocumentPosition(document.querySelector('[aria-labelledby="skills"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
  await impact.getByRole('link', { name: 'Read the experience' }).click()
  await expect(page).toHaveURL('/resume/#deliverzero')
  await expect(page.locator('#deliverzero').getByRole('heading')).toHaveText('DeliverZero')
  expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBe(320)
  await context.close()
})
