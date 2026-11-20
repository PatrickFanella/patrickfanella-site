import type { PGlite } from '@electric-sql/pglite'
import { decodeWire, type Parameter, type WireMessage } from './wire'

export interface Statement { kind: 'prepare' | 'execute'; sql: string; params: Parameter[] }
export interface DatabaseCall { ms: number; statements: Statement[]; sent: WireMessage[]; received: WireMessage[] }

/** Capture the actual pgx input at the bridge. Statements are read from the decoded
 * frames, so a frame the decoder rejects is never recorded or sent to PostgreSQL. */
export function captureDatabase(db: Pick<PGlite, 'execProtocolRaw'>) {
  const named = new Map<string, string>()
  const types = new Map<string, number[]>()
  let calls: DatabaseCall[] | null = null
  function statements(sent: WireMessage[]): Statement[] {
    const found: Statement[] = []
    for (const { type, statementName: name = '', sql, parameters } of sent) {
      if (type === 'P' && sql !== undefined) {
        named.set(name, sql)
        found.push({ kind: 'prepare', sql, params: [] })
      } else if (type === 'B' && parameters) {
        const prepared = named.get(name)
        if (prepared === undefined) throw new Error('Unknown prepared statement')
        found.push({ kind: 'execute', sql: prepared, params: parameters.map((param, index) => {
          const oid = types.get(name)?.[index]
          return oid ? { ...param, oid } : param
        }) })
      } else if (type === 'Q' && sql !== undefined) found.push({ kind: 'execute', sql, params: [] })
    }
    return found
  }
  return {
    proxy: {
      async execProtocolRaw(...args: Parameters<PGlite['execProtocolRaw']>) {
        const sent = decodeWire(args[0], 'sent')
        const captured = statements(sent)
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
