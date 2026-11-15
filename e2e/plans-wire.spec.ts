import AxeBuilder from '@axe-core/playwright'
import { decodeWire } from '../src/desk/inspector/wire'
import { captureDatabase } from '../src/desk/inspector/capture'
import { PGlite } from '@electric-sql/pglite'
import { inspectPlans } from '../src/desk/inspector/plans'
import { test, expect } from './fixtures'

const bytes = (text: string) => [...new TextEncoder().encode(text), 0]
const int16 = (n: number) => [n >>> 8 & 255, n & 255]
const int32 = (n: number) => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255]
const frame = (type: string, body: number[]) => [type.charCodeAt(0), ...int32(body.length + 4), ...body]

test('wire decoding respects frame boundaries, direction, nulls, UTF-8 bytes and unknown messages', () => {
  const parse = frame('P', [...bytes('q'), ...bytes('SELECT $1'), ...int16(1), ...int32(25)])
  const bind = frame('B', [...bytes(''), ...bytes('q'), ...int16(0), ...int16(2), ...int32(2), 195, 169, ...int32(-1), ...int16(0)])
  const sent = new Uint8Array([...parse, ...bind, ...frame('D', [83, ...bytes('q')]), ...frame('E', [...bytes(''), ...int32(0)]), ...frame('S', [])])
  const messages = decodeWire(sent, 'sent')
  expect(messages.map(message => message.name)).toEqual(['Parse', 'Bind', 'Describe', 'Execute', 'Sync'])
  expect(messages.reduce((sum, message) => sum + message.bytes, 0)).toBe(sent.length)
  expect(messages[1].detail).toContain('é')
  expect(messages[1].detail).toContain('$2: NULL')
  expect(messages[1].bytes).toBe(bind.length)
  expect(messages[1].hex.split(' ')).toHaveLength(bind.length)
  const received = decodeWire(new Uint8Array([...frame('1', []), ...frame('2', []), ...frame('D', [...int16(1), ...int32(-1)]), ...frame('C', bytes('SELECT 1')), ...frame('Z', [73]), ...frame('?', [])]), 'received')
  expect(received.map(message => message.name)).toEqual(['ParseComplete', 'BindComplete', 'DataRow', 'CommandComplete', 'ReadyForQuery', 'Unknown (?)'])
  expect(received[2].detail).toContain('NULL')
  expect(() => decodeWire(new Uint8Array([80, 0]), 'sent')).toThrow('Incomplete protocol header')
  // The missing string terminator cannot be borrowed from the following frame.
  expect(() => decodeWire(new Uint8Array([...frame('Q', [65]), ...frame('S', [])]), 'sent')).toThrow('Incomplete protocol field')
})

test('capture records exact reply byte counts and server parameter OIDs for reused statements', async () => {
  let response = new Uint8Array([...frame('1', []), ...frame('t', [...int16(1), ...int32(23)]), ...frame('n', []), ...frame('Z', [73])])
  const capture = captureDatabase({ execProtocolRaw: async () => response } as unknown as Pick<PGlite, 'execProtocolRaw'>)
  capture.begin()
  await capture.proxy.execProtocolRaw(new Uint8Array(frame('P', [...bytes('q'), ...bytes('SELECT $1::int4'), ...int16(0)])))
  const first = capture.finish()[0]
  expect(first.received.reduce((sum, message) => sum + message.bytes, 0)).toBe(response.length)
  expect(first.received[1].parameterTypes).toEqual([23])
  response = new Uint8Array(frame('2', []))
  capture.begin()
  await capture.proxy.execProtocolRaw(new Uint8Array(frame('B', [...bytes(''), ...bytes('q'), ...int16(1), ...int16(1), ...int16(1), ...int32(4), ...int32(20), ...int16(0)])))
  expect(capture.finish()[0].statements[0].params[0]).toEqual({ format: 'binary', value: '00000014', oid: 23 })
})

test('GIN comparison restores all competing indexes and planner settings by rollback', async () => {
  const pg = await PGlite.create()
  try {
    await pg.exec(`CREATE TABLE clips(id int PRIMARY KEY, title text, search_vector tsvector, is_removed boolean DEFAULT false);
      INSERT INTO clips SELECT i, 'world record', to_tsvector('english', 'world record'), false FROM generate_series(1, 8) i;
      CREATE INDEX idx_clips_search_vector ON clips USING gin(search_vector);
      CREATE INDEX moderation ON clips(id) WHERE NOT is_removed;
      ANALYZE clips;`)
    const indexes = () => pg.query('SELECT indexname FROM pg_indexes WHERE tablename = \'clips\' ORDER BY indexname')
    const before = await indexes()
    const sample = await inspectPlans(pg, { kind: 'execute', sql: `SELECT c.id FROM clips c WHERE NOT c.is_removed
      AND c.search_vector @@ to_tsquery('english', $1) ORDER BY c.id LIMIT $2`,
    params: [{ format: 'text', value: 'world:* & record:*' }, { format: 'binary', value: '0000000000000014', oid: 20 }] }, 8)
    expect(JSON.stringify(sample.seq)).toContain('Seq Scan')
    expect(JSON.stringify(sample.gin)).toContain('idx_clips_search_vector')
    expect((await indexes()).rows).toEqual(before.rows)
    expect((await pg.query('SHOW enable_seqscan')).rows).toEqual([{ enable_seqscan: 'on' }])
    expect((await pg.query('SHOW enable_indexscan')).rows).toEqual([{ enable_indexscan: 'on' }])
  } finally { await pg.close() }
})

test('live wire and plan panels capture traffic, grow to 50,008 clips, and shrink back to eight', async ({ page }) => {
  test.setTimeout(300_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/desk/')
  await page.getByRole('button', { name: 'Start Clpr live mode' }).click()
  await expect(page.getByRole('tab', { name: 'Wire', exact: true })).toBeVisible({ timeout: 180_000 })
  await page.getByRole('tab', { name: 'Wire', exact: true }).click()
  const wire = page.locator('[data-inspector-wire]')
  for (const name of ['Parse', 'Bind', 'Describe', 'Execute', 'Sync', 'ParseComplete', 'BindComplete', 'RowDescription', 'DataRow', 'CommandComplete', 'ReadyForQuery']) {
    await expect(wire).toContainText(`${name} (`)
  }
  await expect(wire).toContainText('bytes sent')
  await wire.locator('li').filter({ hasText: /^Parse \(P\)/ }).first().getByText('Raw message hex', { exact: true }).click()
  await expect(wire.locator('details[open] pre')).toContainText('50 00')
  const { violations: wireViolations } = await new AxeBuilder({ page }).include('section.psql').analyze()
  expect(wireViolations).toEqual([])
  await page.getByRole('tab', { name: 'Plan', exact: true }).click()
  const status = page.locator('[data-plan-status]')
  await expect(status).toContainText('8 clips: Sequential scan')
  const samples = page.locator('[data-plan-samples]')
  await expect(samples.locator('tbody tr')).toHaveCount(1)
  for (const rows of [1008, 10008, 30008, 50008]) {
    await page.getByLabel('Table size', { exact: true }).selectOption(String(rows))
    await page.getByRole('button', { name: 'Resize and compare plans' }).click()
    await expect(status).toContainText(`${rows.toLocaleString('en-US')} clips:`, { timeout: 90_000 })
    await expect(page.getByRole('button', { name: 'Resize and compare plans' })).toBeEnabled()
  }
  await expect(status).toContainText('50,008 clips: GIN bitmap scan')
  await expect(samples.locator('tbody tr')).toHaveCount(5)
  await expect(page.locator('[data-plan-output]')).toContainText('sampled cost crossover lies between')
  const costs = await samples.locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('td')].slice(1, 3).map(cell => Number(cell.textContent!.replaceAll(',', '')))))
  expect(costs[0][0]).toBeLessThan(costs[0][1])
  expect(costs.at(-1)![1]).toBeLessThan(costs.at(-1)![0])
  await page.locator('.plan-chart').scrollIntoViewIfNeeded()
  await page.screenshot({ path: test.info().outputPath('plan-desktop.png') })
  // A smaller dataset must physically shrink again, rather than leaving large-table costs behind.
  await page.getByLabel('Table size', { exact: true }).selectOption('8')
  await page.getByRole('button', { name: 'Resize and compare plans' }).click()
  await expect(status).toContainText('8 clips: Sequential scan', { timeout: 90_000 })
  await expect(page.locator('[data-inspector-request]')).toContainText('8 clips (8 fixtures, 0 generated)')
  await expect(samples.locator('tr[data-rows="8"]')).toContainText('Sequential scan')
  const smallCost = Number((await samples.locator('tr[data-rows="8"] td').nth(1).textContent())!.replaceAll(',', ''))
  expect(smallCost).toBeCloseTo(costs[0][0], 0)
  // Changing query clears the old series, while pgx reuses prepared statements.
  const input = page.getByRole('textbox', { name: 'Desk command' })
  await input.fill('search cooking'); await input.press('Enter')
  await expect(page.locator('[data-inspector-request]')).toContainText('q=cooking')
  await expect(samples.locator('tbody tr')).toHaveCount(1)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark' })
  expect(await page.locator('[data-inspector]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  const { violations } = await new AxeBuilder({ page }).include('section.psql').analyze()
  expect(violations).toEqual([])
  await page.screenshot({ path: test.info().outputPath('plan-phone-dark.png'), fullPage: true })
  await page.getByRole('button', { name: 'Stop live mode' }).click()
  await expect(page.locator('[data-inspector]')).toBeHidden()
})
