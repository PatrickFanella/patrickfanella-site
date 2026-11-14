import { test as base, expect, type Page } from '@playwright/test'

// Every test fails if the page logs a console error or throws.
export const test = base.extend<{ errors: string[] }>({
  errors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(e.message))
    await use(errors)
    expect(errors, 'console errors').toEqual([])
  }, { auto: true }],
})
export { expect }

/** Wait until pour-in has finished, so every letter is in its resting place. */
export async function poured(page: Page) {
  await expect(page.locator('[data-pour-in]')).toHaveClass(/\bpoured\b/, { timeout: 10_000 })
}
