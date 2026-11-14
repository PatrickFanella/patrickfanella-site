// Clpr's search code (Go wasm) and PostgreSQL (PGlite) in one dedicated worker. The page talks to
// it with postMessage; every reply carries the id of the message it answers. Throwaway prototype code.
import { PGlite } from './node_modules/@electric-sql/pglite/dist/index.js'
import { vector } from './node_modules/@electric-sql/pglite-pgvector/dist/index.js'
import { pg_trgm } from './node_modules/@electric-sql/pglite/dist/contrib/pg_trgm.js'
import { ltree } from './node_modules/@electric-sql/pglite/dist/contrib/ltree.js'
import { pgcrypto } from './node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js'
import { capturing, seed, setSynthetic } from './capture.mjs'

let db, cap
const say = (m) => postMessage(m)
const phase = async (phases, name, fn) => { const s = performance.now(); say({ type: 'progress', name }); await fn(); phases[name] = Math.round(performance.now() - s) }

async function boot(synthetic) {
  const phases = {}
  let migrations = []
  await phase(phases, 'PostgreSQL', async () => { db = await PGlite.create({ extensions: { vector, pg_trgm, ltree, pgcrypto } }) })
  await phase(phases, 'Migrations', async () => {
    await db.exec('create role clpr')
    migrations = await (await fetch('./migrations.json')).json()
    for (const m of migrations) await db.exec(m)
    await seed(db)
    await db.exec('analyze clips') // same statistics the recorded run planned with
  })
  if (synthetic) await phase(phases, 'Synthetic rows', () => setSynthetic(db, synthetic))
  await phase(phases, 'Go', async () => {
    cap = capturing(db)
    globalThis.pglite = cap.proxy
    await import('./wasm_exec.js')
    const go = new Go()
    const { instance } = await WebAssembly.instantiateStreaming(fetch('./clpr.wasm'), go.importObject)
    go.run(instance)
    while (!globalThis.goReady) await new Promise((r) => setTimeout(r, 10))
    cap.take()
  })
  say({ type: 'ready', phases, migrations: migrations.length, rows: await rowCount() })
}
const rowCount = async () => (await db.query('select count(*)::int n from clips')).rows[0].n

async function request(url) {
  const t0 = performance.now()
  const r = await goHandle('GET', url)
  const ms = performance.now() - t0
  const statements = cap.take()
    .filter((x) => x.sql && !/^(begin|commit|rollback|deallocate|discard)/i.test(x.sql))
    .map((x) => ({ ...x, start: Math.round((x.start - t0) * 100) / 100, dur: Math.round(x.dur * 100) / 100 }))
  let plan = null
  const main = statements.find((x) => x.kind === 'execute' && /FROM clips c\s+WHERE/i.test(x.sql) && /ORDER BY/i.test(x.sql))
  if (main) plan = (await db.query('EXPLAIN (ANALYZE, BUFFERS, TIMING ON, SUMMARY ON) ' + main.sql, main.params)).rows.map((x) => x['QUERY PLAN'])
  cap.take()
  return { url, status: r.status, headers: r.headers, body: r.body, statements, ms: Math.round(ms * 10) / 10, plan, rows: await rowCount() }
}

onmessage = async ({ data }) => {
  try {
    if (data.type === 'boot') return await boot(data.synthetic || 0)
    if (data.type === 'dataset') { const s = performance.now(); await setSynthetic(db, data.synthetic); return say({ type: 'dataset', id: data.id, rows: await rowCount(), ms: Math.round(performance.now() - s) }) }
    if (data.type === 'request') return say({ type: 'result', id: data.id, result: await request(data.url) })
  } catch (e) { say({ type: 'error', id: data.id, message: String(e && e.message || e) }) }
}
