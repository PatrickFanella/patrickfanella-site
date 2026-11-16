import { test, expect } from './fixtures'

const routes = ['/', '/projects/', '/projects/clpr/', '/resume/', '/contact/', '/case-studies/clpr-search/', '/desk/', '/motion/']
test.use({ reducedMotion: 'reduce' })

for (const width of [320, 390, 1280]) test(`shared header fits and has usable targets at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 })
  for (const path of routes) {
    await page.goto(path)
    const header = page.locator('[data-site-header]')
    await expect(header.getByRole('button', { name: /Theme:/ })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const nav = header.getByRole('navigation', { name: 'Main', exact: true })
    for (const [name, href] of [['Work', '/projects/'], ['Résumé', '/resume/'], ['Contact', '/contact/']]) {
      await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('href', href)
    }
    await expect(header.getByRole('link', { name: 'patrickfanella.co — Home' })).toHaveAttribute('href', '/')
    const boxes = await header.locator('a:visible, button:visible').evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
    }))
    for (const box of boxes) {
      expect(box.width, path).toBeGreaterThanOrEqual(44)
      expect(box.height, path).toBeGreaterThanOrEqual(44)
      expect(box.x, path).toBeGreaterThanOrEqual(0)
      expect(box.right, path).toBeLessThanOrEqual(width)
    }
    for (let i = 0; i < boxes.length; i++) for (const other of boxes.slice(i + 1)) {
      const box = boxes[i]
      expect(box.right <= other.x + .5 || other.right <= box.x + .5 || box.bottom <= other.y + .5 || other.bottom <= box.y + .5, path).toBe(true)
    }
    expect((await header.boundingBox())!.height, path).toBeLessThan(100)
    if (path === '/projects/') await expect(nav.getByRole('link', { name: 'Work' })).toHaveAttribute('aria-current', 'page')
    if (path === '/projects/clpr/') await expect(nav.getByRole('link', { name: 'Work' })).toHaveAttribute('aria-current', 'location')
    if (path === '/contact/') await expect(nav.getByRole('link', { name: 'Contact' })).toHaveAttribute('aria-current', 'page')
    if (path === '/resume/') await expect(nav.getByRole('link', { name: 'Résumé' })).toHaveAttribute('aria-current', 'page')
    const measured = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--site-header-height')))
    expect(measured).toBeCloseTo((await header.boundingBox())!.height, 0)
    if (path === '/' || path === '/desk/') await header.screenshot({ path: test.info().outputPath(`header-${path === '/' ? 'home' : 'desk'}-${width}.png`) })
  }
})

test('keyboard navigation, focus, theme persistence and Back work across page types', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/')
  const header = page.locator('[data-site-header]')
  const theme = header.getByRole('button', { name: 'Theme: Light' })
  await theme.focus(); await page.keyboard.press('Space')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await header.getByRole('link', { name: 'patrickfanella.co — Home' }).focus()
  await page.keyboard.press('Tab')
  await expect(header.getByRole('link', { name: 'Work', exact: true })).toBeFocused()
  expect(await page.locator(':focus').evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/projects/')
  for (const [name, path] of [['Résumé', '/resume/'], ['Contact', '/contact/']]) {
    await header.getByRole('link', { name, exact: true }).focus(); await page.keyboard.press('Enter')
    await expect(page).toHaveURL(path)
    await expect(header.getByRole('button', { name: 'Theme: Dark' })).toBeVisible()
  }
  await page.goBack(); await expect(page).toHaveURL('/resume/')
  await expect(header.getByRole('link', { name: 'Résumé' })).toHaveAttribute('aria-current', 'page')
  for (const path of ['/desk/', '/motion/', '/case-studies/clpr-search/']) {
    await page.goto(path)
    await expect(header.getByRole('button', { name: 'Theme: Dark' })).toBeVisible()
  }
  await header.getByRole('button', { name: 'Theme: Dark' }).focus(); await page.keyboard.press('Space')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => localStorage.getItem('pf-theme'))).toBe('light')
})

test('shared navigation remains available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 740 } })
  const page = await context.newPage()
  for (const path of routes) {
    await page.goto(path)
    const header = page.locator('[data-site-header]')
    for (const name of ['Work', 'Résumé', 'Contact']) await expect(header.getByRole('link', { name, exact: true })).toBeVisible()
    await expect(header.locator('[data-theme-switch]')).toBeHidden()
    expect((await header.boundingBox())!.height).toBeLessThan(100)
  }
  await context.close()
})
