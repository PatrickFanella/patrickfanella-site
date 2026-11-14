import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures'

// The desk shares boot.ts with the other pages, so a markup change on one page can break it
// without a merge conflict. These run it the same way as / and /motion/.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`desk, ${colorScheme} theme`, () => {
    test.use({ colorScheme })

    test('loads without errors and passes axe', async ({ page }) => {
      await page.goto('/desk/')
      // The name arrives in place on the desk, so every letter is landed straight away.
      await expect(page.locator('#name [data-ink-letter].landed')).toHaveCount(14)
      await expect(page.locator('[data-theme-switch]')).toHaveAccessibleName(colorScheme === 'dark' ? 'Theme: Dark' : 'Theme: Light')
      await expect(page.locator('[data-pane]')).toHaveCount(5)
      const { violations } = await new AxeBuilder({ page }).analyze()
      expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([])
    })
  })
}

test('Alt+3 moves focus to the third pane', async ({ page }) => {
  await page.goto('/desk/')
  await page.keyboard.press('Alt+Digit3')
  await expect(page.locator('[data-pane="3"]')).toBeFocused()
})
