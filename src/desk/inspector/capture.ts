import type { PGlite } from '@electric-sql/pglite'
import { decodeWire, type WireMessage } from './wire'

export interface Parameter { format: 'text' | 'binary'; value: string | null; oid?: number }
export interface Statement { kind: 'prepare' | 'execute'; sql: string; params: Parameter[] }
export interface DatabaseCall { ms: number; statements: Statement[]; sent: WireMessage[]; received: WireMessage[] }

const decoder = new TextDecoder()

/** Capture the actual pgx input at the bridge. Binary values stay hex: their type is
 * not known from Bind alone, so decoding by byte length would guess their meaning. */
export function captureDatabase(db: Pick<PGlite, 'execProtocolRaw'>) {
  const named = new Map<string, string>()
  const types = new Map<string, number[]>()
  let calls: DatabaseCall[] | null = null
  function statements(bytes: Uint8Array): Statement[] {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const found: Statement[] = []
    let at = 0
    const string = () => {
      const start = at
      while (at < bytes.length && bytes[at] !== 0) at++
      if (at === bytes.length) throw new Error('Unterminated protocol string')
      return decoder.decode(bytes.subarray(start, at++))
    }
    const int16 = () => { const value = view.getUint16(at); at += 2; return value }
    const int32 = () => { const value = view.getInt32(at); at += 4; return value }
    for (let offset = 0; offset + 5 <= bytes.length;) {
      // The startup packet is untyped; it contains no SQL.
      if (bytes[offset] === 0) break
      const type = String.fromCharCode(bytes[offset])
      const length = view.getUint32(offset + 1)
      if (length < 4 || offset + 1 + length > bytes.length) throw new Error('Incomplete protocol message')
      at = offset + 5
      if (type === 'P') {
        const name = string(), sql = string()
        named.set(name, sql)
        found.push({ kind: 'prepare', sql, params: [] })
      } else if (type === 'B') {
        string() // portal
        const name = string(), formats = Array.from({ length: int16() }, int16)
        const params = Array.from({ length: int16() }, (_, index): Parameter => {
          const size = int32(), binary = (formats.length === 1 ? formats[0] : formats[index] ?? 0) === 1
          if (size === -1) return { format: binary ? 'binary' : 'text', value: null }
          if (size < 0 || at + size > bytes.length) throw new Error('Incomplete parameter')
          const value = bytes.subarray(at, at + size); at += size
          return { format: binary ? 'binary' : 'text', value: binary
            ? Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('') : decoder.decode(value) }
        })
        const sql = named.get(name)
        if (sql === undefined) throw new Error('Unknown prepared statement')
        params.forEach((param, index) => { const oid = types.get(name)?.[index]; if (oid) param.oid = oid })
        found.push({ kind: 'execute', sql, params })
      } else if (type === 'Q') found.push({ kind: 'execute', sql: string(), params: [] })
      offset += 1 + length
    }
    return found
  }
  return {
    proxy: {
      async execProtocolRaw(...args: Parameters<PGlite['execProtocolRaw']>) {
        const captured = statements(args[0])
        const sent = decodeWire(args[0], 'sent')
        const start = performance.now()
        let output: Uint8Array = new Uint8Array()
        try { output = await db.execProtocolRaw(...args); return output }
        finally {
          const ms = performance.now() - start
          const received = decodeWire(output, 'received')
          // pgx prepares and describes one statement before binding it. Keep the
          // server's parameter types, so EXPLAIN never guesses a binary value's type.
          const prepared = sent.filter(message => message.type === 'P')
          const described = received.filter(message => message.parameterTypes)
          prepared.forEach((statement, index) => {
            const name = statement.statementName
            if (name !== undefined && described[index]?.parameterTypes) types.set(name, described[index].parameterTypes!)
          })
          calls?.push({ ms, statements: captured, sent, received })
        }
      },
    },
    begin() { calls = [] },
    finish() { const result = calls ?? []; calls = null; return result },
  }
}
