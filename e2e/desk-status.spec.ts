import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { recordedLiveGate, recording } from './recording-policy'
import type { PgEvent } from '../src/desk/pg-protocol'
import type { ClprEvent } from '../src/desk/clpr-protocol'

// What needs a real page: that each view of src/desk/pane-modes.ts reaches the controls, the psql
// text, the timing panel, the inspector and the shell. The modes themselves (every transition, status
// line and stale-reply rule) are tested directly in src/desk/pane-modes.test.ts.
// Fixture workers, not benchmark/performance evidence. Real PostgreSQL and Clpr remain covered by
// desk.spec.ts and clpr.spec.ts.
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

test('the SQL benchmark view reaches the controls, the psql output and the shell', async ({ page }) => {
  const pane = page.locator('section.psql'), status = page.locator('[data-clpr-status]')
  const out = page.locator('.psql-out'), bench = page.locator('.bench'), inspector = page.locator('[data-inspector]')
  expect(await page.evaluate(() => window.deskWorkers.length)).toBe(0)
  await expect(inspector).toBeVisible()
  await expect(out).toBeHidden(); await expect(bench).toBeHidden()
  await expect(page.getByRole('button', { name: 'Stop live mode' })).toBeDisabled()

  await page.getByRole('button', { name: 'Run SQL benchmark' }).click()
  await expect(pane).toHaveAttribute('data-pg', 'starting')
  await expect(out).toBeVisible(); await expect(bench).toBeVisible()
  await expect(inspector).toBeHidden()
  await expect(out).toContainText("-- recorded run from Clpr's demo, 14 Nov 2026. Starting PostgreSQL in this tab.")
  await emit(page, 0, { ev: 'ready', ms: 1, version: '18.6', step: .1 })
  await expect(out).toContainText("-- recorded run from Clpr's demo, 14 Nov 2026. PostgreSQL 18.6 is up in 1 ms; inserting clips.")
  await expect(out).not.toContainText('Starting PostgreSQL')
  await finishSql(page, 0)
  await expect(pane).toHaveAttribute('data-pg', 'live')
  await expect(page.locator('[data-pg-cap]')).toHaveText('Measured in this tab, median of 3 batches')
  await expect(page.locator('[data-pg-sub]')).toHaveText('live in this tab, PostgreSQL 18.6')
  await expect(status).toHaveText('SQL benchmark complete on 50,008 generated clips. Direct SQL, measured in this tab; ready for a shell search.')
  await expect(page.getByRole('button', { name: 'Stop SQL benchmark' })).toBeEnabled()

  const input = page.getByRole('textbox', { name: 'Desk command' })
  await input.fill('search absent'); await input.press('Enter')
  await emit(page, 0, { ev: 'result', id: 1, query: 'absent', run, rows: [], total: 0 })
  await expect(status).toContainText('SQL search complete: 0 matches')
  await expect(page.getByRole('log')).toContainText('No matching clips.')
  await expect(page.locator('.bench .seq')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Stop SQL benchmark' }).click()
  await expect(status).toHaveText('SQL benchmark stopped. The psql pane shows the recorded run.')
  await expect(pane).toHaveAttribute('data-pg', 'idle')
  await expect(inspector).toBeVisible()
  await expect(out).toBeHidden(); await expect(bench).toBeHidden()
  expect(await page.evaluate(() => window.deskWorkers.map(worker => worker.terminated))).toEqual([true])
})

test('the Clpr live view reaches the example control, the inspector and the shell', async ({ page }) => {
  test.skip(!recordedLiveGate.allowed, recordedLiveGate.reason)
  const pane = page.locator('section.psql'), status = page.locator('[data-clpr-status]')
  const out = page.locator('.psql-out'), inspector = page.locator('[data-inspector]')
  await expect(page.locator('.evidence-entry')).toContainText('Recorded example: world record')
  const sample = page.getByRole('button', { name: 'Run example live' })
  const start = page.getByRole('button', { name: 'Start Clpr live mode' })
  await expect(sample).toContainText('MB download')
  await sample.click()
  await expect(pane).toHaveAttribute('data-clpr', 'starting')
  await expect(status).toHaveText('Downloading the pinned Clpr build and starting PostgreSQL.')
  await expect(sample).toBeDisabled(); await expect(start).toBeDisabled()
  await emit(page, 0, { ev: 'ready', migrations: 155, rows: 8, version: '18.6' })
  await expect(page.locator('[data-pg-sub]')).toHaveText(/^Clpr [0-9a-f]{7}, live in this tab$/)
  const result = structuredClone(recording.results[0])
  await emit(page, 0, { ...result, id: 1 })
  await expect(pane).toHaveAttribute('data-clpr', 'live')
  await expect(status).toContainText('Clpr search complete: 2 matches')
  await expect(inspector).toHaveAttribute('data-mode', 'live')
  await expect(inspector).toBeVisible(); await expect(out).toBeHidden()
  await expect(sample).toBeEnabled(); await expect(start).toBeDisabled()

  const input = page.getByRole('textbox', { name: 'Desk command' })
  await input.fill('search world record'); await input.press('Enter')
  await emit(page, 0, { ...result, id: 2 })
  await expect(page.getByRole('log')).toContainText('2 matches')
  await expect(page.getByRole('log')).toContainText('Clpr request time')

  // A mode switch on the page: the inspector returns to its recorded run and gives way to the psql output.
  await page.getByRole('button', { name: 'Run SQL benchmark' }).click()
  await expect(pane).toHaveAttribute('data-clpr', 'idle')
  await expect(inspector).toHaveAttribute('data-mode', 'recorded')
  await expect(inspector).toBeHidden(); await expect(out).toBeVisible()
  await page.getByRole('button', { name: 'Stop SQL benchmark' }).click()
  await expect(inspector).toBeVisible(); await expect(out).toBeHidden()
  await expect(page.locator('.evidence-entry')).toContainText('Recorded example: world record')
  expect(await page.evaluate(() => window.deskWorkers.map(worker => worker.terminated))).toEqual([true, true])
})
