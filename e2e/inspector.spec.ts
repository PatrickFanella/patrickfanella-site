import type { PGlite } from '@electric-sql/pglite'
import { captureDatabase } from '../src/desk/inspector/capture'
import { test, expect } from './fixtures'

const bytes = (text: string) => [...new TextEncoder().encode(text), 0]
const int16 = (value: number) => [value >>> 8 & 255, value & 255]
const int32 = (value: number) => [value >>> 24 & 255, value >>> 16 & 255, value >>> 8 & 255, value & 255]
const frame = (type: string, body: number[]) => [type.charCodeAt(0), ...int32(body.length + 4), ...body]

test('capture keeps prepared SQL across requests, preserves parameter formats and times a batch only once', async () => {
  const database = { execProtocolRaw: async () => new Uint8Array() } as unknown as Pick<PGlite, 'execProtocolRaw'>
  const capture = captureDatabase(database)
  const sql = 'SELECT title FROM clips WHERE title = $1 LIMIT $2'
  const parse = frame('P', [...bytes('search'), ...bytes(sql), ...int16(0)])
  const bind = frame('B', [...bytes(''), ...bytes('search'), ...int16(2), ...int16(0), ...int16(1),
    ...int16(2), ...int32(5), ...new TextEncoder().encode('world'), ...int32(4), ...int32(20), ...int16(0)])
  capture.begin()
  await capture.proxy.execProtocolRaw(new Uint8Array([...parse, ...bind]))
  const first = capture.finish()
  expect(first).toHaveLength(1)
  expect(first[0].ms).toBeGreaterThanOrEqual(0)
  expect(first[0].statements).toEqual([
    { kind: 'prepare', sql, params: [] },
    { kind: 'execute', sql, params: [{ format: 'text', value: 'world' }, { format: 'binary', value: '00000014' }] },
  ])
  capture.begin()
  await capture.proxy.execProtocolRaw(new Uint8Array(bind))
  const second = capture.finish()
  expect(second).toHaveLength(1)
  expect(second[0].statements).toEqual([first[0].statements[1]])
  expect(capture.finish()).toEqual([])
})

test('capture includes calls without SQL and preserves null and simple query text', async () => {
  const database = { execProtocolRaw: async () => new Uint8Array() } as unknown as Pick<PGlite, 'execProtocolRaw'>
  const capture = captureDatabase(database)
  capture.begin()
  await capture.proxy.execProtocolRaw(new Uint8Array(frame('S', [])))
  await capture.proxy.execProtocolRaw(new Uint8Array(frame('Q', bytes('SELECT 1;'))))
  await capture.proxy.execProtocolRaw(new Uint8Array([
    ...frame('P', [...bytes('nullable'), ...bytes('SELECT $1'), ...int16(0)]),
    ...frame('B', [...bytes(''), ...bytes('nullable'), ...int16(0), ...int16(1), ...int32(-1), ...int16(0)]),
  ]))
  const calls = capture.finish()
  expect(calls).toHaveLength(3)
  expect(calls[0].statements).toEqual([])
  expect(calls[1].statements[0].sql).toBe('SELECT 1;')
  expect(calls[2].statements[1].params).toEqual([{ format: 'text', value: null }])
})

test('inspector sections and their purpose exist without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/desk/')
  for (const title of ['Response', 'SQL', 'Timing']) {
    await expect(page.getByRole('region', { name: title, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('tab')).toHaveCount(0)
  await context.close()
})

test('inspector tabs work by keyboard on a narrow dark desk and clear on stop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('/desk/')
  await page.getByRole('button', { name: 'Start Clpr live mode' }).click()
  const response = page.getByRole('tab', { name: 'Response', exact: true })
  await expect(response).toBeVisible({ timeout: 180_000 })
  await response.focus(); await response.press('ArrowRight')
  const sql = page.getByRole('tab', { name: 'SQL', exact: true })
  await expect(sql).toBeFocused(); await expect(sql).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#inspector-response')).toBeHidden()
  await sql.press('End')
  await expect(page.getByRole('tab', { name: 'Timing', exact: true })).toBeFocused()
  await page.getByRole('tab', { name: 'Timing', exact: true }).press('Home')
  await expect(response).toBeFocused()
  expect(await page.locator('[data-inspector]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('inspector-phone-dark.png'), fullPage: true })
  await page.getByRole('button', { name: 'Stop live mode' }).click()
  await expect(page.locator('[data-inspector]')).toBeHidden()
  await expect(page.locator('.psql-out')).toContainText('recorded run')
})
