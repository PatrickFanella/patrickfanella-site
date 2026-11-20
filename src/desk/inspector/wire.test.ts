import { expect, test } from 'vitest'
import { decodeWire } from './wire'
import { bytes, frame, int16, int32 } from './test-frames'

test('wire decoding respects frame boundaries, direction, nulls, UTF-8 bytes and unknown messages', () => {
  const parse = frame('P', [...bytes('q'), ...bytes('SELECT $1'), ...int16(1), ...int32(25)])
  const bind = frame('B', [...bytes(''), ...bytes('q'), ...int16(0), ...int16(2), ...int32(2), 195, 169, ...int32(-1), ...int16(0)])
  const sent = new Uint8Array([...parse, ...bind, ...frame('D', [83, ...bytes('q')]), ...frame('E', [...bytes(''), ...int32(0)]), ...frame('S', [])])
  const messages = decodeWire(sent, 'sent')
  expect(messages.map(message => message.name)).toEqual(['Parse', 'Bind', 'Describe', 'Execute', 'Sync'])
  expect(messages.map(message => message.bytes)).toEqual([23, 24, 8, 10, 5])
  expect(messages[1].detail).toBe('portal ""; statement "q"; $1: "é" (text, 2 bytes); $2: NULL (text); result formats []')
  expect(messages[1].hex.split(' ')).toHaveLength(24)
  const received = decodeWire(new Uint8Array([...frame('1', []), ...frame('2', []), ...frame('D', [...int16(1), ...int32(-1)]), ...frame('C', bytes('SELECT 1')), ...frame('Z', [73]), ...frame('?', [])]), 'received')
  expect(received.map(message => message.name)).toEqual(['ParseComplete', 'BindComplete', 'DataRow', 'CommandComplete', 'ReadyForQuery', 'Unknown (?)'])
  expect(received[2].detail).toContain('NULL')
  expect(() => decodeWire(new Uint8Array([80, 0]), 'sent')).toThrow('Incomplete protocol header')
  // The missing string terminator cannot be borrowed from the following frame.
  expect(() => decodeWire(new Uint8Array([...frame('Q', [65]), ...frame('S', [])]), 'sent')).toThrow('Incomplete protocol field')
})

test('Parse, Bind and Query carry their statement name, SQL and parameters', () => {
  const [parse, bind, query] = decodeWire(new Uint8Array([
    ...frame('P', [...bytes('q'), ...bytes('SELECT $1, $2, $3'), ...int16(0)]),
    ...frame('B', [...bytes(''), ...bytes('q'), ...int16(3), ...int16(0), ...int16(1), ...int16(0),
      ...int16(3), ...int32(2), 195, 169, ...int32(4), ...int32(20), ...int32(-1), ...int16(0)]),
    ...frame('Q', bytes('SELECT 1;')),
  ]), 'sent')
  expect(parse).toMatchObject({ statementName: 'q', sql: 'SELECT $1, $2, $3' })
  expect(parse.parameters).toBeUndefined()
  expect(bind.statementName).toBe('q')
  expect(bind.sql).toBeUndefined()
  expect(bind.parameters).toEqual([{ format: 'text', value: 'é' }, { format: 'binary', value: '00000014' }, { format: 'text', value: null }])
  expect(bind.detail).toBe('portal ""; statement "q"; $1: "é" (text, 2 bytes); $2: 00000014 (binary, 4 bytes); $3: NULL (text); result formats []')
  expect(query.sql).toBe('SELECT 1;')
  expect(query.detail).toBe('SELECT 1;')
})

test('a truncated frame is rejected instead of reading past its end', () => {
  const bind = frame('B', [...bytes(''), ...bytes('q'), ...int16(0), ...int16(1), ...int32(5), ...new TextEncoder().encode('world'), ...int16(0)])
  // Cut short of its declared length.
  expect(() => decodeWire(new Uint8Array(bind.slice(0, -3)), 'sent')).toThrow('Incomplete protocol message')
  // A parameter longer than its frame cannot take its bytes from the Sync that follows.
  const overrun = frame('B', [...bytes(''), ...bytes('q'), ...int16(0), ...int16(1), ...int32(5), 119])
  expect(() => decodeWire(new Uint8Array([...overrun, ...frame('S', [])]), 'sent')).toThrow('Incomplete protocol field')
})

test('RowDescription preserves signed type sizes and unsigned format codes', () => {
  const column = (name: string, oid: number, size: number, format: number) => [
    ...bytes(name), ...int32(0), ...int16(0), ...int32(oid), ...int16(size), ...int32(-1), ...int16(format),
  ]
  const [decoded] = decodeWire(new Uint8Array(frame('T', [...int16(2), ...column('title', 1043, -1, 0), ...column('votes', 23, 4, 1)])), 'received')
  expect(decoded.name).toBe('RowDescription')
  expect(decoded.bytes).toBe(55)
  expect(decoded.detail).toContain('title: OID 1043, text (table 0, column 0, size -1, modifier -1)')
  expect(decoded.detail).toContain('votes: OID 23, binary (table 0, column 0, size 4, modifier -1)')
})
