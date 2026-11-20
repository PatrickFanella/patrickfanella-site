import { test, expect } from './fixtures'
import { recordedLiveGate } from './recording-policy'

test('inspector sections and their purpose exist without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/desk/')
  for (const title of ['Response', 'SQL', 'Timing', 'Wire', 'Plan']) {
    await expect(page.getByRole('region', { name: title, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('tab')).toHaveCount(0)
  await context.close()
})

test('inspector tabs work by keyboard on a narrow dark desk and clear on stop', async ({ page }) => {
  test.skip(!recordedLiveGate.allowed, recordedLiveGate.reason)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('/desk/')
  await page.getByRole('button', { name: 'Start Clpr live mode' }).click()
  await expect(page.locator('[data-inspector]')).toHaveAttribute('data-mode', 'live', { timeout: 180_000 })
  const response = page.getByRole('tab', { name: 'Response', exact: true })
  await expect(response).toBeVisible({ timeout: 180_000 })
  await response.focus(); await response.press('ArrowRight')
  const sql = page.getByRole('tab', { name: 'SQL', exact: true })
  await expect(sql).toBeFocused(); await expect(sql).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#inspector-response')).toBeHidden()
  await sql.press('End')
  await expect(page.getByRole('tab', { name: 'Plan', exact: true })).toBeFocused()
  await page.getByRole('tab', { name: 'Plan', exact: true }).press('Home')
  await expect(response).toBeFocused()
  expect(await page.locator('[data-inspector]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('inspector-phone-dark.png'), fullPage: true })
  await page.getByRole('button', { name: 'Stop live mode' }).click()
  await expect(page.locator('[data-inspector]')).toHaveAttribute('data-mode', 'recorded')
  await expect(page.locator('.psql-out')).toContainText('recorded run')
})
