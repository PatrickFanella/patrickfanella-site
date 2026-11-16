import { createHash } from 'node:crypto'
import provenance from '../src/content/brand-assets-provenance.json' with { type: 'json' }
import { test, expect } from './fixtures'

test.use({ reducedMotion: 'reduce' })
test('only selected brand bytes are served and identity metadata keeps project overrides', async ({ page }) => {
  for (const file of provenance.files) {
    const response = await page.request.get(file.target.replace(/^public/, ''))
    expect(response.ok()).toBe(true)
    expect(createHash('sha256').update(await response.body()).digest('hex')).toBe(file.sha256)
  }
  expect(createHash('sha256').update(await (await page.request.get('/favicon.svg')).body()).digest('hex')).toBe(provenance.files.find(f => f.target.endsWith('/favicon.svg'))!.sha256)
  for (const path of ['/', '/resume/', '/contact/', '/projects/clpr/']) {
    await page.goto(path)
    const image = page.locator('meta[property="og:image"]')
    await expect(image).toHaveCount(1)
    await expect(image).toHaveAttribute('content', path.includes('/clpr/') ? /projects\/social\/clpr.png$/ : /brand\/patrick\/share-card.png$/)
    await expect(page.locator('meta[property="og:image:alt"]')).not.toHaveAttribute('content', '')
    await expect(page.locator('.home-mark')).toHaveAttribute('src', /pf-solid-wavy.svg$/)
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
      expect(await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--ground').trim())).toBe(theme === 'dark' ? '#10131e' : '#e9eff2')
    }
  }
})
