import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { recordedLiveGate, recording } from './recording-policy'
import type { PgEvent } from '../src/desk/pg-protocol'
import type { ClprEvent } from '../src/desk/clpr-protocol'

// Deterministic controller-boundary fixtures, not benchmark/performance evidence.
// Real PostgreSQL and Clpr remain covered by desk.spec.ts and clpr.spec.ts.
declare global {
  interface Window { deskWorkers: { emit(data: unknown): void; fail(): void; terminated: boolean }[] }
}
test.use({ reducedMotion: 'reduce' })
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.deskWorkers = []
    class FixtureWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      terminated = false
      constructor() { window.deskWorkers.push(this) }
      postMessage() {}
      terminate() { this.terminated = true }
      // Deliberately allow late delivery to exercise a queued callback after termination.
      emit(data: unknown) { this.onmessage?.({ data } as MessageEvent) }
      fail() { this.onerror?.(new ErrorEvent('error', { message: 'fixture worker failed', cancelable: true })) }
    }
    window.Worker = FixtureWorker as unknown as typeof Worker
  })
  await page.goto('/desk/')
})
async function emit(page: Page, index: number, event: PgEvent | ClprEvent) {
  await page.evaluate(({ index, event }) => window.deskWorkers[index].emit(event), { index, event })
}
const run = { plan: ['Index Scan using idx_clips_search_vector', 'Execution Time: 2.0 ms'], exec: 2, runs: 5, batches: [1, 2, 3] }
async function finishSql(page: Page, index: number) {
  await emit(page, index, { ev: 'ready', ms: 1, version: '18.6', step: .1 })
  await emit(page, index, { ev: 'seed', ms: 1, rows: 50008 })
  await emit(page, index, { ev: 'bench', kind: 'seq', run: { ...run, exec: 10, plan: ['Seq Scan on clips'] } })
  await emit(page, index, { ev: 'index', ms: 1 })
  await emit(page, index, { ev: 'bench', kind: 'idx', run, rows: [], total: 0 })
}

test('committed SQL output clears Running and search terminal states allow retry', async ({ page }) => {
  await page.getByRole('button', { name: 'Run SQL benchmark' }).click()
  await finishSql(page, 0)
  await expect(page.locator('[data-pg-cap]')).toHaveText('Measured in this tab, median of 3 batches')
  const status = page.locator('[data-clpr-status]')
  await expect(status).toContainText('SQL benchmark complete')
  await expect(status).not.toContainText('Running')
  const input = page.getByRole('textbox', { name: 'Desk command' })
  await input.fill('search absent'); await input.press('Enter')
  await emit(page, 0, { ev: 'search', id: 1, query: 'absent', run, rows: [], total: 0 })
  await expect(status).toContainText('SQL search complete: 0 matches')
  await expect(page.getByRole('log')).toContainText('No matching clips.')
  await input.fill('search retry'); await input.press('Enter')
  await emit(page, 0, { ev: 'search-error', id: 2, message: 'fixture search failed' })
  await expect(status).toContainText('SQL search failed')
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
  await input.fill('search retry'); await input.press('Enter')
  await emit(page, 0, { ev: 'search', id: 3, query: 'retry', run, rows: [{ title: 'fixture match', creator: 'fixture', votes: 1 }], total: 1 })
  await expect(status).toContainText('SQL search complete: 1 match')
})

test('cancel, worker failure, retry and mode switches reject stale worker callbacks', async ({ page }) => {
  test.skip(!recordedLiveGate.allowed, recordedLiveGate.reason)
  const status = page.locator('[data-clpr-status]')
  await page.getByRole('button', { name: 'Run SQL benchmark' }).click()
  await page.getByRole('button', { name: 'Stop SQL benchmark' }).click()
  await expect(status).toContainText('SQL benchmark stopped')
  await emit(page, 0, { ev: 'error', message: 'stale SQL failure' })
  await expect(status).toContainText('SQL benchmark stopped')
  await expect(page.locator('[data-inspector]')).toHaveAttribute('data-mode', 'recorded')
  await page.getByRole('button', { name: 'Run SQL benchmark' }).click()
  await page.evaluate(() => window.deskWorkers[1].fail())
  await expect(status).toContainText('SQL benchmark failed')
  await expect(status).toContainText('recorded')
  await page.getByRole('button', { name: 'Run SQL benchmark' }).click()
  await finishSql(page, 2)
  await expect(status).toContainText('SQL benchmark complete')
  await page.getByRole('button', { name: 'Start Clpr live mode' }).click()
  await expect(page.locator('section.psql')).toHaveAttribute('data-clpr', 'starting')
  await finishSql(page, 2)
  await emit(page, 2, { ev: 'error', message: 'stale SQL failure after switching' })
  await expect(status).toContainText('Downloading the pinned Clpr build')
  await emit(page, 3, { ev: 'error', message: 'fixture Clpr failure' })
  await expect(status).toContainText('The recorded run is still available')
  await page.getByRole('button', { name: 'Start Clpr live mode' }).click()
  await emit(page, 4, { ev: 'ready', migrations: 155, rows: 8, version: '18.6' })
  const result = structuredClone(recording.results[0])
  await emit(page, 4, { ...result, id: 1 })
  await expect(status).toContainText('Clpr search complete')
  const input = page.getByRole('textbox', { name: 'Desk command' })
  await input.fill('search absent'); await input.press('Enter')
  const body = JSON.parse(result.response.body)
  body.counts.clips = 0; body.results.clips = []
  await emit(page, 4, { ...result, id: 2, response: { ...result.response, body: JSON.stringify(body) } })
  await expect(status).toContainText('Clpr search complete: 0 matches')
  await page.getByRole('button', { name: 'Run SQL benchmark' }).click()
  await emit(page, 4, { ev: 'progress', message: 'stale Clpr progress' })
  await emit(page, 4, { ev: 'error', message: 'stale Clpr failure' })
  await expect(status).toContainText('SQL benchmark')
  await expect(status).not.toContainText('stale')
  await finishSql(page, 5)
  await expect(status).toContainText('SQL benchmark complete')
  expect(await page.evaluate(() => window.deskWorkers.slice(0, 5).every(worker => worker.terminated))).toBe(true)
})


test('example action opts in and supports matches, no match, failure, cancellation and retry', async ({ page }) => {
  test.skip(!recordedLiveGate.allowed, recordedLiveGate.reason)
  expect(await page.evaluate(() => window.deskWorkers.length)).toBe(0)
  await expect(page.locator('.evidence-entry')).toContainText('Recorded example: world record')
  const sample = page.getByRole('button', { name: 'Run example live' })
  const input = page.getByRole('textbox', { name: 'Example search' })
  const status = page.locator('[data-clpr-status]')
  await expect(sample).toContainText('MB download')
  await sample.click()
  await expect(sample).toBeDisabled()
  await page.getByRole('button', { name: 'Stop live mode' }).click()
  await expect(status).toContainText('Live mode stopped')
  await sample.click()
  await emit(page, 1, { ev: 'ready', migrations: 155, rows: 8, version: '18.6' })
  const result = structuredClone(recording.results[0])
  await emit(page, 1, { ...result, id: 1 })
  await expect(status).toContainText('Clpr search complete: 2 matches')
  await expect(sample).toBeEnabled()
  await input.fill('absent'); await sample.click()
  const body = JSON.parse(result.response.body); body.counts.clips = 0; body.results.clips = []
  await emit(page, 1, { ...result, id: 2, response: { ...result.response, body: JSON.stringify(body) } })
  await expect(status).toContainText('Clpr search complete: 0 matches')
  await expect(sample).toBeEnabled()
  await sample.click(); await emit(page, 1, { ev: 'error', message: 'fixture failure' })
  await expect(status).toContainText('The recorded run is still available')
  await expect(page.locator('[data-inspector]')).toHaveAttribute('data-mode', 'recorded')
  await sample.click()
  await emit(page, 2, { ev: 'ready', migrations: 155, rows: 8, version: '18.6' })
  await emit(page, 2, { ...result, id: 4 })
  await expect(status).toContainText('Clpr search complete: 2 matches')
  await expect(page.locator('.evidence-entry')).toContainText('Recorded example: world record')
})
