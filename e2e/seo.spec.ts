import AxeBuilder from '@axe-core/playwright'
import { allProjects, selectedProjects } from '../src/content/project-presentation'
import studies from '../src/content/project-case-studies.json' with { type: 'json' }
import { test, expect } from './fixtures'

test('the sitemap contains indexable canonical pages and images from their visible content', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  const robots = await (await page.request.get('/robots.txt')).text()
  expect(robots).toContain('Allow: /')
  expect(robots).toContain('Sitemap: https://patrickfanella.co/sitemap.xml')
  const response = await page.request.get('/sitemap.xml')
  expect(response.headers()['content-type']).toMatch(/^(application|text)\/xml(?:;|$)/)
  const entries = await page.evaluate(xml => {
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    if (document.querySelector('parsererror')) throw new Error('Invalid sitemap XML')
    return Array.from(document.getElementsByTagNameNS('http://www.sitemaps.org/schemas/sitemap/0.9', 'url')).map(entry => ({
      url: entry.getElementsByTagNameNS('http://www.sitemaps.org/schemas/sitemap/0.9', 'loc')[0].textContent!,
      images: Array.from(entry.getElementsByTagNameNS('http://www.google.com/schemas/sitemap-image/1.1', 'loc')).map(image => image.textContent!),
    }))
  }, await response.text())
  expect(new Set(entries.map(entry => entry.url)).size).toBe(entries.length)
  expect(entries.filter(entry => entry.images.length).length).toBeGreaterThan(0)
  for (const entry of entries) {
    const url = new URL(entry.url)
    expect(url.origin).toBe('https://patrickfanella.co')
    expect(url.pathname.endsWith('/')).toBe(true)
    expect((await page.goto(url.pathname))?.status()).toBe(200)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', entry.url)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow, max-image-preview:large')
    for (const image of entry.images) {
      const path = new URL(image).pathname
      await expect(page.locator(`img[src="${path}"]`)).toHaveCount(1)
      expect((await page.request.get(path)).ok()).toBe(true)
    }
  }
  await context.close()
})

test('historical project URLs stay readable with noindex and remain outside the sitemap', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  const sitemap = await (await page.request.get('/sitemap.xml')).text()
  const current = new Set(selectedProjects.map(project => project.slug))
  for (const project of allProjects.filter(project => !current.has(project.slug))) {
    const path = `/projects/${project.slug}/`
    expect(sitemap).not.toContain(`https://patrickfanella.co${path}`)
    expect((await page.goto(path))?.status()).toBe(200)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://patrickfanella.co${path}`)
    await expect(page.locator('.project-detail')).toContainText('Historical project entry')
  }
  await context.close()
})

test('case-study article and breadcrumb data match the rendered page without scripts', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  for (const study of studies.studies) {
    await page.goto(`/case-studies/${study.slug}/`)
    const data = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!)
    const article = data['@graph'].find((node: { '@type': string }) => node['@type'] === 'Article')
    const person = data['@graph'].find((node: { '@type': string }) => node['@type'] === 'Person')
    expect(article.headline).toBe(await page.getByRole('heading', { level: 1 }).textContent())
    expect(article.description).toBe(await page.locator('meta[name="description"]').getAttribute('content'))
    expect(article.author['@id']).toBe(person['@id'])
    expect(person.name).toBe('Patrick Fanella')
    await expect(page.locator('.product-study figure img').first()).toHaveAttribute('src', new URL(article.image).pathname)
    const webPage = data['@graph'].find((node: { '@type': string }) => node['@type'] === 'WebPage')
    expect(article.mainEntityOfPage['@id']).toBe(webPage['@id'])
    expect(webPage.mainEntity['@id']).toBe(article['@id'])
    const breadcrumb = data['@graph'].find((node: { '@type': string }) => node['@type'] === 'BreadcrumbList')
    expect(webPage.breadcrumb['@id']).toBe(breadcrumb['@id'])
    const items = page.getByRole('navigation', { name: 'Breadcrumb', exact: true }).locator('li')
    await expect(items).toHaveCount(breadcrumb.itemListElement.length)
    for (const [index, item] of breadcrumb.itemListElement.entries()) {
      expect(item.position).toBe(index + 1)
      await expect(items.nth(index)).toHaveText(item.name)
      if (index < breadcrumb.itemListElement.length - 1) {
        await expect(items.nth(index).locator('a')).toHaveAttribute('href', new URL(item.item).pathname)
      } else {
        await expect(items.nth(index).locator('[aria-current="page"]')).toHaveText(item.name)
      }
    }
  }
  await context.close()
})

for (const colorScheme of ['light', 'dark'] as const) test(`SEO breadcrumbs fit narrow and enlarged layouts in ${colorScheme}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
  for (const path of ['/case-studies/rekolekt/', '/projects/obsidian-plugin-metronome-tuner/']) {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(path)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    await page.setViewportSize({ width: 320, height: 740 })
    expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBe(320)
  }
})
