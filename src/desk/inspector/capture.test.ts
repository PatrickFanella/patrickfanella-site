import type { PGlite } from '@electric-sql/pglite'
import { expect, test } from 'vitest'
import { captureDatabase } from './capture'
import { bytes, frame, int16, int32 } from './test-frames'

type Database = Pick<PGlite, 'execProtocolRaw'>
const silent = { execProtocolRaw: async () => new Uint8Array() } as unknown as Database

test('capture keeps prepared SQL across requests, preserves parameter formats and times a batch only once', async () => {
  const capture = captureDatabase(silent)
  const sql = 'SELECT title FROM clips WHERE title = $1 LIMIT $2'
  const parse = frame('P', [...bytes('search'), ...bytes(sql), ...int16(0)])
  const bind = frame('B', [...bytes(''), ...bytes('search'), ...int16(2), ...int16(0), ...int16(1),
    ...int16(2), ...int32(5), ...new TextEncoder().encode('world'), ...int32(4), ...int32(20), ...int16(0)])
  const execute = { kind: 'execute', sql, params: [{ format: 'text', value: 'world' }, { format: 'binary', value: '00000014' }] }
  capture.begin()
  await capture.proxy.execProtocolRaw(new Uint8Array([...parse, ...bind]))
  const first = capture.finish()
  expect(first).toHaveLength(1)
  expect(first[0].ms).toBeGreaterThanOrEqual(0)
  expect(first[0].statements).toEqual([{ kind: 'prepare', sql, params: [] }, execute])
  capture.begin()
  await capture.proxy.execProtocolRaw(new Uint8Array(bind))
  const second = capture.finish()
  expect(second).toHaveLength(1)
  expect(second[0].statements).toEqual([execute])
  expect(capture.finish()).toEqual([])
})

test('capture includes calls without SQL and preserves null and simple query text', async () => {
  const capture = captureDatabase(silent)
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
  expect(calls[1].statements).toEqual([{ kind: 'execute', sql: 'SELECT 1;', params: [] }])
  expect(calls[2].statements[1].params).toEqual([{ format: 'text', value: null }])
})

test('capture records exact reply byte counts and server parameter OIDs for reused statements', async () => {
  let response = new Uint8Array([...frame('1', []), ...frame('t', [...int16(1), ...int32(23)]), ...frame('n', []), ...frame('Z', [73])])
  const capture = captureDatabase({ execProtocolRaw: async () => response } as unknown as Database)
  capture.begin()
  await capture.proxy.execProtocolRaw(new Uint8Array(frame('P', [...bytes('q'), ...bytes('SELECT $1::int4'), ...int16(0)])))
  const first = capture.finish()[0]
  expect(first.received.map(message => message.bytes)).toEqual([5, 11, 5, 6])
  expect(first.received[1].parameterTypes).toEqual([23])
  response = new Uint8Array(frame('2', []))
  capture.begin()
  await capture.proxy.execProtocolRaw(new Uint8Array(frame('B', [...bytes(''), ...bytes('q'), ...int16(1), ...int16(1), ...int16(1), ...int32(4), ...int32(20), ...int16(0)])))
  const second = capture.finish()[0]
  expect(second.statements[0].params).toEqual([{ format: 'binary', value: '00000014', oid: 23 }])
  // The OID belongs to the captured statement; the decoded Bind frame stays as sent.
  expect(second.sent[0].parameters).toEqual([{ format: 'binary', value: '00000014' }])
})

test('capture refuses a truncated frame or an unprepared statement before PostgreSQL sees it', async () => {
  let reached = 0
  const capture = captureDatabase({ execProtocolRaw: async () => { reached++; return new Uint8Array() } } as unknown as Database)
  const bind = frame('B', [...bytes(''), ...bytes('missing'), ...int16(0), ...int16(0), ...int16(0)])
  capture.begin()
  await expect(capture.proxy.execProtocolRaw(new Uint8Array(bind.slice(0, -1)))).rejects.toThrow('Incomplete protocol message')
  await expect(capture.proxy.execProtocolRaw(new Uint8Array(bind))).rejects.toThrow('Unknown prepared statement')
  expect(reached).toBe(0)
  expect(capture.finish()).toEqual([])
})
