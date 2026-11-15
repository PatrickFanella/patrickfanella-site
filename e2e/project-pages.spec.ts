import AxeBuilder from '@axe-core/playwright'
import catalog from '../src/content/portfolio.json' with { type: 'json' }
import { test, expect } from './fixtures'

test.use({ reducedMotion: 'reduce' })

test('every catalog page has its content, social metadata and working local images without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  for (const project of catalog.projects) {
    expect((await page.goto(`/projects/${project.slug}/`))?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(project.title)
    await expect(page.locator('.project-detail')).toContainText(project.description || project.summary)
    await expect(page.locator('.project-facts')).toContainText(project.deliveryStatus ?? 'Status not stated in source')
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
  }
  await context.close()
})

test('list links, return link and legacy redirects reach the right project', async ({ page }) => {
  await page.goto('/projects/')
  await expect(page.locator('a[data-project-name]')).toHaveCount(catalog.projects.length)
  await page.getByRole('link', { name: 'Clpr', exact: true }).click()
  await expect(page).toHaveURL('/projects/clpr/')
  await page.getByRole('link', { name: 'All projects', exact: true }).click()
  await expect(page).toHaveURL('/projects/#clpr')
  for (const [old, current] of [['transcript-create', 'rekolekt'], ['discord-spywatcher', 'backline']]) {
    await page.goto(`/projects/${old}/`)
    await expect(page).toHaveURL(`/projects/${current}/`)
  }
})

test('the selected name participates in the cross-document hand-over', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.route('**/projects/**', async route => {
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
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/projects/clpr/')
  expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBe(390)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.screenshot({ path: test.info().outputPath(`project-${colorScheme}-phone.png`), fullPage: true })
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
