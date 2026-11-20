import AxeBuilder from '@axe-core/playwright'
import data from '../src/desk/inspector/recorded-run.json' with { type: 'json' }
import { liveGate, type Recording } from '../src/desk/inspector/live-policy'
import { responseMarkup, sqlMarkup, wireMarkup } from '../src/desk/inspector/render'
import { manifest } from '../src/desk/clpr-protocol'
import { test, expect } from './fixtures'
import { recordedLiveGate } from './recording-policy'

const recording = data as Recording

test('the shared renderer escapes captured response, SQL, parameters and wire strings', () => {
  const event = structuredClone(recording.results[0]), attack = '<img src=x onerror="alert(1)">'
  event.response.body = JSON.stringify({ results: { clips: [{ title: attack }] } })
  event.response.headers.Attack = attack
  event.calls[0].statements = [{ kind: 'execute', sql: `SELECT ${attack}`, params: [{ format: 'text', value: attack }] }]
  event.calls[0].sent[0].detail = attack
  for (const markup of [responseMarkup(event), sqlMarkup(event), wireMarkup(event)]) {
    expect(markup).not.toContain('<img')
    expect(markup).toContain('&lt;img')
  }
})

test('every panel contains complete recorded evidence without JavaScript or a worker download', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } })
  const page = await context.newPage(), large: string[] = []
  page.on('request', request => { if (/\.wasm|\.data|\.tar\.gz|clpr\.worker-/.test(request.url())) large.push(request.url()) })
  await page.goto('/desk/')
  await expect(page.locator('section.psql')).toHaveCSS('opacity', '1')
  await expect(page.locator('section.psql')).toHaveCSS('backdrop-filter', 'none')
  await expect(page.locator('[data-inspector-recording]')).toContainText(recording.meta.recordedAt.slice(0, 10))
  for (const title of ['Response', 'SQL', 'Timing', 'Wire', 'Plan']) await expect(page.getByRole('region', { name: title, exact: true })).toBeVisible()
  await expect(page.locator('[data-inspector-response]')).toContainText('2 returned clips')
  await expect(page.locator('[data-inspector-response]')).toContainText('HTTP 200')
  await expect(page.locator('[data-inspector-sql]')).toContainText('search_vector')
  await expect(page.locator('[data-inspector-sql]')).toContainText('world:* & record:*')
  await expect(page.locator('[data-inspector-timing]')).toContainText('Total handler request')
  for (const name of ['Parse', 'Bind', 'Describe', 'Execute', 'Sync', 'DataRow', 'ReadyForQuery']) await expect(page.locator('[data-inspector-wire]')).toContainText(`${name} (`)
  await expect(page.locator('[data-plan-samples] tbody tr')).toHaveCount(5)
  await expect(page.locator('[data-plan-output]')).toContainText('sampled cost crossover')
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.locator('[data-plan-size]')).toBeHidden()
  expect(large).toEqual([])
  expect(await page.locator('[data-inspector]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  // All five expanded sections make a long document. Capture the evidence in
  // the viewport rather than exceeding Chromium's full-page texture limit.
  await page.locator('[data-inspector-recording]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: test.info().outputPath('recorded-no-script-phone.png') })
  await context.close()
})

test('recorded tabs load without large payloads and the start button states measured cost', async ({ page }) => {
  const large: string[] = []
  page.on('request', request => { if (/\.wasm|\.data|\.tar\.gz|clpr\.worker-/.test(request.url())) large.push(request.url()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/desk/')
  const start = page.getByRole('button', { name: 'Start Clpr live mode' })
  await expect(start).toContainText(`${(recording.meta.downloadBytes / 1e6).toFixed(2)} MB download`)
  await expect(start).toContainText(`${Math.ceil(recording.meta.memory.peakBytes / 1048576).toLocaleString('en-US')} MiB measured peak`)
  await expect(page.locator('[data-inspector]')).toHaveAttribute('data-mode', 'recorded')
  if (!recordedLiveGate.allowed) {
    await expect(start).toBeDisabled()
    await expect(page.locator('[data-clpr-status]')).toHaveText(recordedLiveGate.reason)
  }
  if (process.env.CI) {
    expect(recording.meta.ciRun).toMatch(/https:\/\/github.com\/.+\/actions\/runs\/\d+/)
    await expect(page.getByRole('link', { name: 'Recorded in CI', exact: true })).toBeVisible()
  }
  await page.getByRole('tab', { name: 'Plan', exact: true }).click()
  await expect(page.locator('[data-plan-samples] tbody tr')).toHaveCount(5)
  await page.locator('.plan-chart').scrollIntoViewIfNeeded()
  const { violations } = await new AxeBuilder({ page }).include('section.psql').analyze()
  expect(violations).toEqual([])
  expect(large).toEqual([])
  await page.screenshot({ path: test.info().outputPath('recorded-plan.png') })
})

test('a denied build policy keeps the recorded evidence and cannot start a worker', async ({ page }) => {
  const large: string[] = []
  page.on('request', request => { if (/\.wasm|\.data|\.tar\.gz|clpr\.worker-/.test(request.url())) large.push(request.url()) })
  const meta = structuredClone(recording.meta); meta.memory.peakBytes = meta.budget.maxPeakRssBytes + 1
  const gate = liveGate(meta, meta.sourceFingerprint, manifest)
  await page.route('**/desk/', async route => {
    const response = await route.fetch()
    const body = (await response.text()).replace('data-live-allowed="true"', 'data-live-allowed="false"').replace(/data-live-reason(?:="[^"]*")?/, `data-live-reason="${gate.reason}"`)
    await route.fulfill({ response, body })
  })
  await page.goto('/desk/')
  const start = page.getByRole('button', { name: 'Start Clpr live mode' })
  await expect(start).toBeDisabled()
  await expect(page.locator('[data-clpr-status]')).toHaveText(gate.reason)
  // Even an enabled control cannot bypass the handler's policy guard.
  await start.evaluate(button => { (button as HTMLButtonElement).disabled = false })
  await start.click()
  await expect(page.locator('section.psql')).toHaveAttribute('data-clpr', 'idle')
  await expect(page.locator('[data-inspector]')).toHaveAttribute('data-mode', 'recorded')
  await expect(page.locator('[data-inspector-response]')).toContainText('2 returned clips')
  expect(large).toEqual([])
})
