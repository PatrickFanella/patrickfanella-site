import AxeBuilder from '@axe-core/playwright'
import { assetPaths } from '../src/content/project-catalog.mjs'
import { catalog } from '../src/content/projects.mjs'
import { redirects } from '../src/content/site-facts.mjs'
import { test, expect } from './fixtures'
const { all: allProjects, featured: featuredProjects, selected: selectedProjects } = catalog

test.use({ reducedMotion: 'reduce' })

test('selected directory exposes four studies and twelve other projects without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto('/projects/')
  const featured = page.getByRole('region', { name: 'Featured projects', exact: true })
  // How many there are and which four are featured is stated in src/content/project-catalog.test.ts.
  await expect(featured.locator('h3')).toHaveText(featuredProjects.map(project => project.title))
  await expect(page.locator('.project-list article')).toHaveCount(selectedProjects.length)
  for (const project of selectedProjects) {
    const item = page.locator(`article[id="${project.slug}"]`)
    const link = item.locator('a[data-project-name]')
    await expect(link).toHaveAttribute('href', project.path)
    expect((await page.request.get((await link.getAttribute('href'))!)).status()).toBe(200)
    const media = project.media[0]
    await expect(item.locator('figure')).toHaveCount(media ? 1 : 0)
    if (!media) continue
    const image = item.locator('img')
    await expect(image).toHaveAttribute('alt', media.alt)
    await expect(image).toHaveAttribute('loading', 'lazy')
    expect(Number(await image.getAttribute('width'))).toBeGreaterThan(0)
    expect(Number(await image.getAttribute('height'))).toBeGreaterThan(0)
    await expect(item.locator('figcaption')).toContainText(media.caption)
    await expect(item.locator('figcaption')).toContainText('2026')
    for (const path of assetPaths({ media: [media] })) expect((await page.request.get(path)).status(), path).toBe(200)
  }
  // Native lazy loading still resolves responsive media when the reader reaches it.
  for (const slug of ['clpr', 'undertow']) {
    const image = page.locator(`#${slug} img`)
    await image.scrollIntoViewIfNeeded()
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
    expect(await image.evaluate((el: HTMLImageElement) => el.currentSrc)).toContain('-640.webp')
    const response = await page.request.get((await image.getAttribute('srcset'))!.split(' ')[0])
    expect((await response.body()).byteLength).toBeLessThan(100_000)
  }
  await context.close()
})

test('every current and retained project page has its content, social metadata and working local images without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  for (const project of allProjects) {
    expect((await page.goto(project.path))?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(project.title)
    await expect(page.locator('.project-detail')).toContainText(project.description || project.summary)
    await expect(page.locator('.project-detail header .project-facts')).toContainText(project.deliveryStatus ?? 'Status not stated in source')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', project.summary)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', `${project.title} | Patrick Fanella`)
    const image = await page.locator('meta[property="og:image"]').getAttribute('content')
    const card = await page.request.get(new URL(image!).pathname)
    expect(card.status()).toBe(200)
    expect(card.headers()['content-type']).toContain('image/png')
    for (const media of project.media) {
      expect((await page.request.get(media.src)).status(), media.src).toBe(200)
    }
    await expect(page.locator('.project-detail figure')).toHaveCount(project.media.length)
    await expect(page.locator('.project-detail header .lead')).toHaveText(project.summary)
    await expect(page.locator('.project-facts')).toContainText([project.role, project.stack.join(', ') || 'Not specified in source'])
    for (const [index, media] of project.media.entries()) {
      const figure = page.locator('.project-detail figure').nth(index)
      await expect(figure.locator('figcaption')).toContainText(media.caption)
      await expect(figure.locator('img')).toHaveAttribute('alt', media.alt)
      await expect(figure.locator('img')).toHaveAttribute('loading', index === 0 ? 'eager' : 'lazy')
    }
    if (project.media.length) {
      expect(await page.locator('.project-detail').evaluate(article => {
        const lead = article.querySelector('figure')!
        return [...article.querySelectorAll('section')].every(section =>
          Boolean(lead.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING))
      })).toBe(true)
    }
  }
  await context.close()
})

test('Clpr opens its source-backed search study in one activation without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/projects/clpr/')
  const study = page.getByRole('link', { name: 'Read the search decisions study', exact: true })
  await expect(study).toHaveAttribute('href', '/case-studies/clpr-search/')
  await study.click()
  await expect(page).toHaveURL('/case-studies/clpr-search/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await context.close()
})

test('list links, return link and legacy redirects reach the right project', async ({ page }) => {
  await page.goto('/projects/')
  await expect(page.locator('a[data-project-name]')).toHaveCount(selectedProjects.length)
  await page.getByRole('link', { name: 'Clpr', exact: true }).click()
  await expect(page).toHaveURL('/projects/clpr/')
  await page.getByRole('link', { name: 'All projects', exact: true }).click()
  await expect(page).toHaveURL('/projects/#clpr')
  // Stated here as well, so a changed, emptied or shortened map cannot pass unnoticed.
  expect(redirects).toEqual({
    '/projects/transcript-create': '/projects/rekolekt/',
    '/projects/discord-spywatcher': '/projects/backline/',
  })
  for (const [old, current] of Object.entries(redirects)) {
    await page.goto(`${old}/`)
    await expect(page).toHaveURL(current)
  }
})

test('the selected name participates in the cross-document hand-over', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.route('**/projects/**', async route => {
    // Apply the navigation policy only to documents, not newly visible /assets/projects/ media.
    if (!route.request().isNavigationRequest()) return route.continue()
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "script-src 'self'" } })
  })
  await page.goto('/projects/')
  // Capture the outgoing name after pageswap listeners run; survives navigation in sessionStorage.
  await page.evaluate(() => addEventListener('pageswap', event => {
    sessionStorage.setItem('outgoing-project', `${!!event.viewTransition}:${getComputedStyle(document.querySelector('[data-project-name="clpr"]')!).viewTransitionName}`)
  }))
  await page.getByRole('link', { name: 'Clpr', exact: true }).click()
  await expect(page).toHaveURL('/projects/clpr/')
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('outgoing-project'))).toBe('true:project-name')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clpr')
  await page.evaluate(() => addEventListener('pageswap', event => {
    sessionStorage.setItem('returning-project', `${!!event.viewTransition}:${getComputedStyle(document.querySelector('[data-project-name="clpr"]')!).viewTransitionName}`)
  }))
  await page.getByRole('link', { name: 'All projects', exact: true }).click()
  await expect(page).toHaveURL('/projects/#clpr')
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('returning-project'))).toBe('true:project-name')
})

for (const colorScheme of ['light', 'dark'] as const) test(`project detail fits mobile and passes axe in ${colorScheme}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme })
  for (const slug of ['clpr', 'undertow', 'rekolekt', 'subcorp']) {
    await page.setViewportSize({ width: 320, height: 740 })
    await page.goto(allProjects.find(project => project.slug === slug)!.path)
    expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBe(320)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBe(390)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: test.info().outputPath(`project-${slug}-${colorScheme}-phone.png`) })
    if (await page.locator('.project-detail figure').count()) {
      await page.locator('.project-detail figure').first().scrollIntoViewIfNeeded()
      await page.screenshot({ path: test.info().outputPath(`project-${slug}-${colorScheme}-media-phone.png`) })
    }
  }
})

// Returning before the hand-over finishes cancels it; that must not reject on the page.
test('an interrupted hand-over cleans up its project name', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  // Force ready to reject, rather than relying on navigation timing to cancel it.
  await page.addInitScript(() => addEventListener('pagereveal', ((event: PageRevealEvent) => {
    event.viewTransition?.skipTransition()
  }) as EventListener))
  await page.goto('/projects/')
  await page.getByRole('link', { name: 'Clpr', exact: true }).click()
  await page.waitForURL('/projects/clpr/')
  await page.getByRole('link', { name: 'All projects', exact: true }).click()
  await expect(page).toHaveURL('/projects/#clpr')
  await expect.poll(() => page.locator('[data-project-name="clpr"]').evaluate(el => el.style.viewTransitionName)).toBe('')
})
