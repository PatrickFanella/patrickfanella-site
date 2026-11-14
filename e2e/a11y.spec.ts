import AxeBuilder from '@axe-core/playwright'
import { test, expect, poured } from './fixtures'

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme })

    for (const path of ['/', '/motion/']) {
      test(`axe finds no violations on ${path}`, async ({ page }) => {
        await page.goto(path)
        await poured(page)
        // The switch follows the system theme, so this confirms the emulation took.
        await expect(page.locator('[data-theme-switch]')).toHaveAccessibleName(colorScheme === 'dark' ? 'Theme: Dark' : 'Theme: Light')
        const { violations } = await new AxeBuilder({ page }).analyze()
        expect(violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([])
      })
    }
  })
}
