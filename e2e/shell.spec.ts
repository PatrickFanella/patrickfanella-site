import { test, expect } from './fixtures'
import { searchTerms } from '../src/desk/pg-protocol'

test.describe('desk shell', () => {
  test.use({ reducedMotion: 'reduce' })
  test('commands have links, history and accessible output', async ({ page }) => {
    await page.goto('/desk/')
    const input = page.getByRole('textbox', { name: 'Desk command' })
    const log = page.getByRole('log', { name: 'Command output' })
    for (const command of ['help', 'projects', 'resume', 'contact', 'unknown', 'search']) {
      await input.fill(command); await input.press('Enter')
      await expect(log.locator(':scope > div')).toHaveCount(['help', 'projects', 'resume', 'contact', 'unknown', 'search'].indexOf(command) + 1)
    }
    await expect(log).toHaveAttribute('aria-live', 'polite')
    await expect(log).toContainText('search <words>')
    // The page writes this reply from the project catalog; src/content/project-catalog.test.ts states how it is built.
    await expect(log).toContainText('Clpr: Twitch clip search and moderation. Clustr: Reddit community map in 2D and 3D. HasanAra: searchable broadcast archive. Undertow: browser music-video editor (live beta).')
    await expect(log.getByRole('link', { name: 'Browse all projects and delivery statuses' })).toHaveAttribute('href', '/projects/')
    await expect(log.getByRole('link', { name: 'Read the résumé and download the PDF' })).toHaveAttribute('href', '/resume/')
    await expect(log.getByRole('link', { name: 'fanella.patrick@gmail.com' })).toHaveAttribute('href', 'mailto:fanella.patrick@gmail.com')
    await expect(log).toContainText('Unknown command. Type help')
    await expect(log).toContainText('Usage: search <words>')
    await input.fill('draft'); await input.press('ArrowUp'); await expect(input).toHaveValue('search')
    await input.press('ArrowUp'); await expect(input).toHaveValue('unknown')
    await input.press('ArrowDown'); await input.press('ArrowDown'); await expect(input).toHaveValue('draft')
  })

  test('searches use the live worker, refresh psql, and recover after no matches', async ({ page }) => {
    await page.goto('/desk/')
    await page.getByRole('button', { name: 'Run SQL benchmark' }).click()
    await expect(page.locator('section.psql')).toHaveAttribute('data-pg', 'live', { timeout: 240_000 })
    const input = page.getByRole('textbox', { name: 'Desk command' })
    const log = page.getByRole('log', { name: 'Command output' })
    for (const words of ['world record', 'zzzznomatch', 'clutch fight']) {
      await input.fill(`search ${words}`); await input.press('Enter')
      await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
      await expect(page.locator('[data-pg-cap]')).toHaveText('Your search, measured in this tab')
      await expect(page.locator('.psql-out')).toContainText(searchTerms(words))
    }
    await expect(log).toContainText('2 matches')
    await expect(log).toContainText('Top hit: speedrun world record attempt')
    await expect(log).toContainText('0 matches')
    await expect(log).toContainText('No matching clips.')
    await expect(log).toContainText('ms (mean query time)')
    await expect(page.locator('.psql-out')).toContainText('clutch fight')
  })

  test('a search during startup reports loading without using recorded matches', async ({ page }) => {
    let release!: () => void
    const held = new Promise<void>(r => { release = r })
    await page.route('**/pg.worker-*.js', async route => { await held; await route.continue() })
    await page.goto('/desk/')
    await page.getByRole('button', { name: 'Run SQL benchmark' }).click()
    const input = page.getByRole('textbox', { name: 'Desk command' })
    await input.fill('search world record'); await input.press('Enter')
    await expect(page.getByRole('log')).toContainText('PostgreSQL is still starting')
    await expect(page.getByRole('log')).not.toContainText('2 matches')
    release()
  })
})
