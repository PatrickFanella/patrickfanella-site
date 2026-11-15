import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { test, expect } from './fixtures'
import { manifest } from '../src/desk/clpr-protocol'
import { recordedLiveGate } from './recording-policy'

test.skip(!recordedLiveGate.allowed, recordedLiveGate.reason)

test.use({ reducedMotion: 'reduce' })

test('the desk shows provenance without downloading a worker, Wasm or database', async ({ page }) => {
  const large: string[] = []
  page.on('request', request => {
    if (/\.wasm|\.data|\.tar\.gz|(?:pg|clpr)\.worker-/.test(request.url())) large.push(request.url())
  })
  await page.goto('/desk/')
  await expect(page.locator('#name [data-ink-letter].landed')).toHaveCount(14)
  const meta = page.locator('[data-clpr-meta]')
  await expect(meta).toContainText(manifest.commit.slice(0, 7))
  await expect(meta).toContainText(manifest.date.slice(0, 10))
  await expect(meta).toContainText(`${(manifest.wasm.gzipBytes / 1e6).toFixed(2)} MB gzip`)
  await expect(meta).toContainText(manifest.goVersion)
  await expect(page.locator('[data-clpr-provenance]')).toContainText(manifest.builtInClprCI ? 'Built in Clpr CI' : 'Built outside Clpr CI')
  expect(large).toEqual([])
  await expect(page.locator('section.psql')).toHaveAttribute('data-pg', 'idle')
  await page.getByRole('textbox', { name: 'Desk command' }).fill('search world record')
  await page.getByRole('textbox', { name: 'Desk command' }).press('Enter')
  await expect(page.getByRole('log')).toContainText('Start Clpr live mode or the SQL benchmark')
  expect(large).toEqual([])
})

test('Clpr runs all migrations and returns its real JSON through pgx', async ({ page }) => {
  await page.goto('/desk/')
  await page.getByRole('button', { name: 'Start Clpr live mode' }).click()
  await expect(page.locator('section.psql')).toHaveAttribute('data-clpr', 'live', { timeout: 180_000 })
  await expect(page.locator('[data-clpr-status]')).toContainText(`all ${manifest.migrationCount} migrations applied, 8 fixture clips`)
  const output = page.locator('[data-inspector-response]')
  await expect(output).toContainText('HTTP 200')
  const input = page.getByRole('textbox', { name: 'Desk command' })
  for (const words of ['world record', 'zzzznomatch', 'cooking']) {
    await input.fill(`search ${words}`); await input.press('Enter')
    await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
    await expect(page.locator('[data-inspector-request]')).toContainText(new URLSearchParams({ q: words, type: 'clips' }).toString())
    await page.getByRole('tab', { name: 'Response', exact: true }).click()
    await expect(output).toContainText('HTTP 200')
    await expect(output).toContainText('Content-Type: application/json')
    await expect(output).toContainText(`"query": "${words}"`)
    await expect(output).toContainText(words === 'zzzznomatch' ? 'No matching clips.' : words === 'cooking' ? '1 returned clip:' : '2 returned clips:')
    await page.getByRole('tab', { name: 'SQL', exact: true }).click()
    const sql = page.locator('[data-inspector-sql]')
    await expect(sql).toContainText('Filter')
    await expect(sql).toContainText('Order')
    await expect(sql).toContainText('Limit')
    await expect(sql).toContainText('Parameters ($1, $2, … in order)')
    await expect(sql).toContainText(words === 'world record' ? 'world:* & record:*' : `${words}:*`)
    // pgx may ping the connection before its SELECT; inspect the search statement.
    await sql.locator('details').filter({ has: page.locator('pre').filter({ hasText: 'SELECT' }) }).first().locator('summary').click()
    await expect(sql.locator('details[open] pre')).toContainText('SELECT')
    await page.getByRole('tab', { name: 'Timing', exact: true }).click()
    const times = await page.locator('[data-timing] dd').evaluateAll(elements => elements.map(element => Number((element as HTMLElement).dataset.ms)))
    expect(times).toHaveLength(3)
    expect(times.every(value => Number.isFinite(value) && value >= 0)).toBe(true)
    expect(times[0]).toBeCloseTo(times[1] + times[2], 6)
    await expect(page.locator('[data-inspector-timing]')).toContainText('not measured separately')
    // Selection survives the next search; every panel still updates for that request.
  }
  await page.getByRole('tab', { name: 'Response', exact: true }).click()
  const log = page.getByRole('log')
  await expect(log).toContainText('2 matches')
  await expect(log).toContainText('Top hit: speedrun world record attempt')
  await expect(log).toContainText('0 matches')
  await expect(log).toContainText('Top hit: cooking stream goes wrong')
  await expect(log).toContainText('Clpr request time')
  await expect(output).toContainText('"query": "cooking"')
  await expect(output).toContainText('"twitch_clip_id": "fixture-2"')
  await expect(output).toContainText('"counts"')
  const { violations } = await new AxeBuilder({ page }).include('section.psql').analyze()
  expect(violations.map(v => `${v.id}: ${v.help}`)).toEqual([])
  await page.screenshot({ path: test.info().outputPath('clpr-live.png') })
  await page.getByRole('button', { name: 'Stop live mode' }).click()
  await expect(page.locator('section.psql')).toHaveAttribute('data-clpr', 'idle')
  await expect(page.locator('.psql-out')).toContainText('recorded run')
  await expect(page.locator('[data-inspector]')).toHaveAttribute('data-mode', 'recorded')
  await expect(page.getByRole('button', { name: 'Start Clpr live mode' })).toBeEnabled()
})

test('a corrupt artifact falls back to recorded evidence and can be retried', async ({ page }) => {
  await page.route('**/clpr/*/search.wasm.gz', route => route.fulfill({ body: 'corrupt payload' }))
  await page.goto('/desk/')
  await page.getByRole('button', { name: 'Start Clpr live mode' }).click()
  await expect(page.locator('section.psql')).toHaveAttribute('data-clpr', 'failed', { timeout: 90_000 })
  await expect(page.locator('[data-clpr-status]')).toContainText('The recorded run is still available')
  await expect(page.locator('.psql-out')).toContainText('recorded run')
  await page.unroute('**/clpr/*/search.wasm.gz')
  await page.getByRole('button', { name: 'Start Clpr live mode' }).click()
  await expect(page.locator('section.psql')).toHaveAttribute('data-clpr', 'live', { timeout: 180_000 })
  await expect(page.locator('[data-inspector-response]')).toContainText('HTTP 200')
})

test('stopping a pending download restores recorded evidence without waiting', async ({ page }) => {
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/clpr/*/search.wasm.gz', async route => { await held; await route.continue() })
  await page.goto('/desk/')
  await page.getByRole('button', { name: 'Start Clpr live mode' }).click()
  await expect(page.locator('section.psql')).toHaveAttribute('data-clpr', 'starting')
  await page.getByRole('button', { name: 'Stop live mode' }).click()
  await expect(page.locator('section.psql')).toHaveAttribute('data-clpr', 'idle')
  await expect(page.locator('.psql-out')).toContainText('recorded run')
  release()
})

test('loads a gzip file when the server does not mark it as HTTP compression', async ({ page }) => {
  const packed = await readFile(`public/clpr/${manifest.commit}/search.wasm.gz`)
  await page.route('**/clpr/*/search.wasm.gz', route => route.fulfill({ body: packed, contentType: 'application/gzip' }))
  await page.goto('/desk/')
  await page.getByRole('button', { name: 'Start Clpr live mode' }).click()
  await expect(page.locator('section.psql')).toHaveAttribute('data-clpr', 'live', { timeout: 180_000 })
  await expect(page.locator('[data-inspector-response]')).toContainText('HTTP 200')
})

test('live controls fit a narrow dark desk and remain accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/desk/')
  await expect(page.getByRole('button', { name: 'Start Clpr live mode' })).toBeVisible()
  const fits = await page.locator('.clpr-controls').evaluate(element => element.scrollWidth <= element.clientWidth)
  expect(fits).toBe(true)
  const { violations } = await new AxeBuilder({ page }).include('section.psql').analyze()
  expect(violations.map(v => `${v.id}: ${v.help}`)).toEqual([])
  await page.screenshot({ path: test.info().outputPath('clpr-phone-dark.png'), fullPage: true })
})
