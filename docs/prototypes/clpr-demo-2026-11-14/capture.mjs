// Reads the Postgres wire-protocol messages pgx sends to PGlite and records each round trip:
// a prepare (Parse without Bind) or an execute (Bind), with its SQL, parameters, start time and
// duration measured around execProtocolRaw. Throwaway prototype code.
const td = new TextDecoder()
function cstr(b, o) { let e = o; while (b[e] !== 0) e++; return [td.decode(b.subarray(o, e)), e + 1] }
function i16(b, o) { return (b[o] << 8) | b[o + 1] }
function i32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0 }
const tidy = (s) => s.replace(/\s+/g, ' ').trim()
// Lists the messages in a buffer as [type, byte length]. Backend messages always have a type byte.
function frames(b, frontend) {
  const out = []; let o = 0
  while (o + 5 <= b.length) {
    if (frontend && b[o] === 0) break
    const len = i32(b, o + 1); out.push([String.fromCharCode(b[o]), len + 1]); if (len < 4) break; o += 1 + len
  }
  return out
}

export function capturing(db) {
  const named = new Map()
  let log = []
  const decode = (bytes, fmt) => {
    if (fmt === 0) return td.decode(bytes)
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.length)
    if (bytes.length === 8) return Number(v.getBigInt64(0))
    if (bytes.length === 4) return v.getInt32(0)
    if (bytes.length === 2) return v.getInt16(0)
    return td.decode(bytes)
  }
  // Returns the round trips found in one batch of frontend messages.
  const scan = (b) => {
    const found = []; let parsed = null; let o = 0
    while (o + 5 <= b.length) {
      if (b[o] === 0) break // startup message has no type byte
      const t = String.fromCharCode(b[o]), len = i32(b, o + 1), body = o + 5
      if (t === 'P') { const [name, a] = cstr(b, body); const [sql] = cstr(b, a); named.set(name, sql); parsed = sql }
      if (t === 'B') {
        let [, a] = cstr(b, body); let stmt; [stmt, a] = cstr(b, a)
        const nf = i16(b, a); a += 2; const fmts = []; for (let k = 0; k < nf; k++) { fmts.push(i16(b, a)); a += 2 }
        const np = i16(b, a); a += 2; const params = []
        for (let k = 0; k < np; k++) { const l = i32(b, a); a += 4; if (l === 0xffffffff) { params.push(null); continue }
          params.push(decode(b.subarray(a, a + l), fmts.length === 1 ? fmts[0] : (fmts[k] ?? 0))); a += l }
        found.push({ kind: 'execute', sql: tidy(named.get(stmt) || ''), params }); parsed = null
      }
      if (t === 'Q') { found.push({ kind: 'execute', sql: tidy(cstr(b, body)[0]), params: [] }) }
      if (len < 4) break
      o = o + 1 + len
    }
    if (parsed && !found.length) found.push({ kind: 'prepare', sql: tidy(parsed), params: [] })
    return found
  }
  return {
    proxy: {
      async execProtocolRaw(msg, opts) {
        let found = []; try { found = scan(msg) } catch {}
        const start = performance.now()
        const out = await db.execProtocolRaw(msg, opts)
        const dur = performance.now() - start
        let wire = null
        try { wire = { sent: frames(msg, true), received: frames(out, false) } } catch {}
        for (const f of found) log.push({ ...f, start, dur, wire })
        return out
      },
    },
    take() { const l = log; log = []; return l },
  }
}

export const FIXTURE = [
  ['speedrun world record attempt', 'runner_a', 41], ['chat reacts to the world record', 'streamer_b', 33],
  ['cooking stream goes wrong', 'chef_c', 12], ['clutch final round in ranked', 'pro_d', 58],
  ['world first raid clear', 'guild_e', 71], ['record breaking subathon finale', 'host_f', 22],
  ['rock and roll cover on stream', 'band_g', 9], ['c++ live coding session', 'dev_h', 15],
]
export async function seed(db) {
  for (const [i, [title, name, votes]] of FIXTURE.entries())
    await db.query(`insert into clips(twitch_clip_id,twitch_clip_url,embed_url,title,creator_name,broadcaster_name,created_at,vote_score)
      values ($1,$2,$2,$3,$4,$4,timestamp '2026-11-01' + ($5 || ' hours')::interval,$6)`, ['fixture-' + i, 'https://example.invalid/clip/' + i, title, name, String(i * 7), votes])
}
// Synthetic rows from a small vocabulary so the planner has a real choice to make.
export async function setSynthetic(db, n) {
  // Delete, then rewrite the table so the planner sees its real size, not the dead space.
  await db.exec(`delete from clips where twitch_clip_id like 'synthetic-%'`)
  await db.exec('vacuum full clips')
  if (n > 0) await db.exec(`insert into clips(twitch_clip_id,twitch_clip_url,embed_url,title,creator_name,broadcaster_name,created_at,vote_score)
    select 'synthetic-' || g, 'https://example.invalid/s/' || g, 'https://example.invalid/s/' || g,
      (array['speedrun','world','record','raid','ranked','cooking','music','clutch','finale','coding','reaction','highlight'])[1 + (g * 7) % 12] || ' ' ||
      (array['attempt','moment','clip','fail','win','session','stream','cover','round','run'])[1 + (g * 13) % 10] || ' ' || g,
      'synthetic_' || (g % 500), 'synthetic_' || (g % 500), timestamp '2026-01-01' + (g || ' minutes')::interval, (g * 31) % 100
    from generate_series(1, ${Number(n)}) g`)
  await db.exec('analyze clips')
}
