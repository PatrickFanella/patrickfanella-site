import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import icons from '../src/content/site-icons.json' with { type: 'json' }
import resume from '../src/content/resume.json' with { type: 'json' }
import { siteMetadata } from '../src/content/site-metadata'
import { test, expect } from './fixtures'

test('published pages expose consistent, page-specific metadata without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  const xml = await (await page.request.get('/sitemap.xml')).text()
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url)
  expect(urls.length).toBeGreaterThan(20)
  const checkedImages = new Set<string>()
  for (const canonical of urls) {
    await page.goto(`${new URL(canonical).pathname}?utm_source=metadata-check`)
    const title = await page.title()
    const pathname = new URL(canonical).pathname
    const description = await page.locator('meta[name="description"]').getAttribute('content')
    expect(title).toContain('Patrick Fanella')
    expect(description!.length).toBeGreaterThan(30)
    if ((pathname.startsWith('/projects/') && pathname !== '/projects/') || (pathname.startsWith('/case-studies/') && pathname !== '/case-studies/')) {
      await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article')
    }
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical)
    for (const [property, value] of Object.entries({
      'og:title': title, 'og:description': description!, 'og:url': canonical,
      'og:site_name': resume.name, 'og:locale': 'en_US', 'og:image:type': 'image/png',
      'og:image:width': '1200', 'og:image:height': '630',
    })) {
      const meta = page.locator(`meta[property="${property}"]`)
      await expect(meta).toHaveCount(1)
      await expect(meta).toHaveAttribute('content', value)
    }
    const image = (await page.locator('meta[property="og:image"]').getAttribute('content'))!
    expect(image).toMatch(/^https:\/\/patrickfanella\.co\/.+\.png$/)
    await expect(page.locator('meta[property="og:image:secure_url"]')).toHaveAttribute('content', image)
    for (const [name, value] of Object.entries({ author: resume.name, 'application-name': resume.name,
      'twitter:card': 'summary_large_image', 'twitter:title': title, 'twitter:description': description!, 'twitter:image': image })) {
      await expect(page.locator(`meta[name="${name}"]`)).toHaveAttribute('content', value)
    }
    await expect(page.locator('meta[property="og:image:alt"]')).not.toHaveAttribute('content', '')
    await expect(page.locator('meta[name="twitter:image:alt"]')).toHaveAttribute('content', (await page.locator('meta[property="og:image:alt"]').getAttribute('content'))!)
    if (!checkedImages.has(image)) {
      const response = await page.request.get(new URL(image).pathname)
      expect(response.ok()).toBe(true)
      expect(response.headers()['content-type']).toContain('image/png')
      const dimensions = await sharp(await response.body()).metadata()
      expect([dimensions.width, dimensions.height]).toEqual([1200, 630])
      checkedImages.add(image)
    }
    const data = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!)
    const person = data['@graph'].find((node: { '@type': string }) => node['@type'] === 'Person')
    expect(person.name).toBe(resume.name)
    expect(person.jobTitle).toBe(resume.headline)
    expect(person.sameAs).toEqual([resume.github, resume.linkedin])
    const webPage = data['@graph'].find((node: { url?: string; '@type': string }) => node.url === canonical && ['WebPage', 'ProfilePage'].includes(node['@type']))
    expect(webPage.name).toBe(title)
    expect(webPage.description).toBe(description)
    if (new URL(canonical).pathname === '/') {
      expect(title).toBe(siteMetadata.title)
      expect(webPage['@type']).toBe('ProfilePage')
      expect(webPage.mainEntity['@id']).toBe(person['@id'])
    }
  }
  await context.close()
})

test('favicon fallbacks and the web manifest serve the recorded icon bytes', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('sizes', 'any')
  for (const path of ['/favicon.ico', '/favicon-96x96.png', '/favicon.svg', '/apple-touch-icon.png']) {
    const link = page.locator(`link[href^="${path}?"]`)
    await expect(link).toHaveCount(1)
    await expect(link).toHaveAttribute('href', /\?v=[a-f0-9]{12}$/)
  }
  for (const file of icons.files) {
    const response = await page.request.get(file.path)
    expect(response.ok()).toBe(true)
    expect(createHash('sha256').update(await response.body()).digest('hex')).toBe(file.sha256)
  }
  expect(icons.sourceSha256).toBe(createHash('sha256').update(await readFile(icons.source)).digest('hex'))
  const response = await page.request.get('/site.webmanifest')
  expect(response.headers()['content-type']).toContain('application/manifest+json')
  const manifest = await response.json()
  expect(manifest).toMatchObject({ name: resume.name, start_url: '/', scope: '/', display: 'browser', lang: 'en-US' })
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(['192x192', '512x512'])
  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src)
    expect(response.ok()).toBe(true)
    const dimensions = await sharp(await response.body()).metadata()
    expect(`${dimensions.width}x${dimensions.height}`).toBe(icon.sizes)
    expect(dimensions.hasAlpha).toBe(false)
  }
})

test('browser theme colors follow system, manual and persisted theme choices', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto('/contact/')
  const colors = page.locator('meta[name="theme-color"]')
  const expectColor = async (value: string) => {
    await expect(colors).toHaveCount(2)
    for (const meta of await colors.all()) await expect(meta).toHaveAttribute('content', value)
  }
  await expectColor(siteMetadata.lightColor)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expectColor(siteMetadata.darkColor)
  await page.locator('[data-theme-switch]').click()
  await expectColor(siteMetadata.lightColor)
  await page.reload()
  await expectColor(siteMetadata.lightColor)
})
