export interface Parameter { format: 'text' | 'binary'; value: string | null; oid?: number }
/** A decoded frame. Parse and Query carry sql; Parse and Bind name their statement; Bind carries
 * its parameters; ParameterDescription carries the server's parameter OIDs. */
export interface WireMessage {
  type: string; name: string; bytes: number; detail: string; hex: string
  parameterTypes?: number[]
  statementName?: string
  sql?: string
  parameters?: Parameter[]
}

const frontend: Record<string, string> = { P: 'Parse', B: 'Bind', D: 'Describe', E: 'Execute', S: 'Sync', Q: 'Query', H: 'Flush', C: 'Close', X: 'Terminate' }
const backend: Record<string, string> = { '1': 'ParseComplete', '2': 'BindComplete', '3': 'CloseComplete', T: 'RowDescription', D: 'DataRow', C: 'CommandComplete', Z: 'ReadyForQuery', t: 'ParameterDescription', n: 'NoData', E: 'ErrorResponse', N: 'NoticeResponse', I: 'EmptyQueryResponse', s: 'PortalSuspended', R: 'Authentication', S: 'ParameterStatus', K: 'BackendKeyData' }
const decoder = new TextDecoder()

/** Decode within each frame's bounds: every field read goes through need(), so a truncated
 * frame throws instead of borrowing bytes from the next one. Counts include its type byte and
 * length word. Unknown messages keep their bytes rather than acquiring an invented meaning.
 * Binary Bind values stay hex: their type is not known from Bind alone. */
export function decodeWire(bytes: Uint8Array, direction: 'sent' | 'received'): WireMessage[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const messages: WireMessage[] = []
  for (let offset = 0; offset < bytes.length;) {
    const startup = direction === 'sent' && bytes[offset] === 0
    const header = startup ? 4 : 5
    if (offset + header > bytes.length) throw new Error('Incomplete protocol header')
    const length = view.getUint32(offset + (startup ? 0 : 1))
    const end = offset + length + (startup ? 0 : 1)
    if (length < 4 || end > bytes.length) throw new Error('Incomplete protocol message')
    const type = startup ? '' : String.fromCharCode(bytes[offset])
    let at = offset + header
    const need = (size: number) => { if (size < 0 || at + size > end) throw new Error('Incomplete protocol field') }
    const u16 = () => { need(2); const n = view.getUint16(at); at += 2; return n }
    const i16 = () => { need(2); const n = view.getInt16(at); at += 2; return n }
    const i32 = () => { need(4); const n = view.getInt32(at); at += 4; return n }
    const string = () => {
      const start = at
      while (at < end && bytes[at] !== 0) at++
      need(1)
      return decoder.decode(bytes.subarray(start, at++))
    }
    const message: WireMessage = { type, name: startup ? 'StartupMessage' : (direction === 'sent' ? frontend : backend)[type] ?? `Unknown (${type})`,
      bytes: end - offset, detail: '', hex: Array.from(bytes.subarray(offset, end), byte => byte.toString(16).padStart(2, '0')).join(' ') }
    if (direction === 'sent') {
      if (type === 'P') {
        const name = string(), sql = string(), types = Array.from({ length: u16() }, i32)
        message.statementName = name; message.sql = sql
        message.detail = `statement ${JSON.stringify(name)}; ${sql}; parameter OIDs [${types.join(', ')}]`
      } else if (type === 'B') {
        const portal = string(), name = string(), formats = Array.from({ length: u16() }, u16)
        const sizes: number[] = []
        const parameters = Array.from({ length: u16() }, (_, index): Parameter => {
          const size = i32(), format = (formats.length === 1 ? formats[0] : formats[index] ?? 0) === 1 ? 'binary' : 'text'
          sizes.push(size)
          if (size === -1) return { format, value: null }
          need(size)
          const value = bytes.subarray(at, at + size); at += size
          return { format, value: format === 'text' ? decoder.decode(value) : Array.from(value, b => b.toString(16).padStart(2, '0')).join('') }
        })
        const resultFormats = Array.from({ length: u16() }, u16)
        message.statementName = name; message.parameters = parameters
        message.detail = `portal ${JSON.stringify(portal)}; statement ${JSON.stringify(name)}; ${parameters.map(({ format, value }, index) => `$${index + 1}: ${value === null ? `NULL (${format})`
          : `${format === 'text' ? JSON.stringify(value) : value} (${format}, ${sizes[index]} bytes)`}`).join('; ')}; result formats [${resultFormats.join(', ')}]`
      } else if (type === 'D' || type === 'C') {
        need(1); const target = String.fromCharCode(bytes[at++])
        message.detail = `${target === 'S' ? 'statement' : 'portal'} ${JSON.stringify(string())}`
      } else if (type === 'E') message.detail = `portal ${JSON.stringify(string())}; max rows ${i32()} (0 means all)`
      else if (type === 'Q') message.detail = message.sql = string()
    } else {
      if (type === 't') { message.parameterTypes = Array.from({ length: u16() }, i32); message.detail = `parameter OIDs [${message.parameterTypes.join(', ')}]` }
      else if (type === 'C') message.detail = string()
      else if (type === 'Z') { need(1); message.detail = `transaction status ${String.fromCharCode(bytes[at])}` }
      else if (type === 'T') {
        const columns = Array.from({ length: u16() }, () => {
          const name = string(), table = i32(), column = u16(), oid = i32(), size = i16(), modifier = i32(), format = u16()
          return `${name}: OID ${oid}, ${format === 1 ? 'binary' : 'text'} (table ${table}, column ${column}, size ${size}, modifier ${modifier})`
        })
        message.detail = columns.join('; ')
      } else if (type === 'D') {
        const columns = Array.from({ length: u16() }, () => {
          const size = i32()
          if (size === -1) return 'NULL'
          need(size); at += size; return `${size} bytes`
        })
        message.detail = `${columns.length} columns: ${columns.join(', ')}; values are in the raw hex (formats come from RowDescription)`
      } else if (type === 'E' || type === 'N') {
        const fields: string[] = []
        while (at < end && bytes[at] !== 0) { const code = String.fromCharCode(bytes[at++]); fields.push(`${code}: ${string()}`) }
        message.detail = fields.join('; ')
      } else if (type === 'S') message.detail = `${string()} = ${string()}`
    }
    messages.push(message); offset = end
  }
  return messages
}
