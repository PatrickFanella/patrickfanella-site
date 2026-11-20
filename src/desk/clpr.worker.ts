// All large imports, PostgreSQL migrations, and Go execution stay in this opt-in worker.
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { ltree } from '@electric-sql/pglite/contrib/ltree'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { artifactBase, manifest, type ClprEvent, type ClprRequest, type ClprResponse } from './clpr-protocol'
import { replies } from './worker-replies'
import { captureDatabase } from './inspector/capture'
import { clipSearch, inspectPlans, resizeClips } from './inspector/plans'

declare global {
  var pglite: Pick<PGlite, 'execProtocolRaw'>
  var goReady: boolean | undefined
  var goHandle: (method: string, url: string) => Promise<ClprResponse>
  var Go: new () => { importObject: WebAssembly.Imports; run(instance: WebAssembly.Instance): Promise<void> }
}

const { post, fail, serve } = replies<ClprRequest, ClprEvent>(self)

async function downloaded(name: keyof typeof manifest.files): Promise<ArrayBuffer> {
  const response = await fetch(artifactBase + name)
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  return response.arrayBuffer()
}

async function verify(data: ArrayBuffer, expected: { bytes: number; sha256: string }, name: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
  if (data.byteLength !== expected.bytes || hash !== expected.sha256) throw new Error(`${name}: artifact integrity check failed`)
}

async function checked(name: keyof typeof manifest.files): Promise<ArrayBuffer> {
  const data = await downloaded(name)
  await verify(data, manifest.files[name], name)
  return data
}

async function loadWasm(): Promise<ArrayBuffer> {
  const data = await downloaded('search.wasm.gz')
  // Some static servers set Content-Encoding: gzip for .wasm.gz. Fetch then returns
  // decoded bytes. Other hosts return the gzip file itself. Verify either exact form.
  if (data.byteLength === manifest.wasm.bytes) {
    await verify(data, manifest.wasm, 'search.wasm')
    return data
  }
  await verify(data, manifest.files['search.wasm.gz'], 'search.wasm.gz')
  const raw = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  await verify(raw, manifest.wasm, 'search.wasm')
  return raw
}

async function main() {
  post({ ev: 'progress', message: 'Downloading the pinned Clpr build and starting PostgreSQL.' })
  const [raw, migrationData, pg] = await Promise.all([
    loadWasm(), checked('migrations.json'),
    PGlite.create({ extensions: { vector, pg_trgm, ltree, pgcrypto } }),
  ])
  const migrations: { name: string; sql: string }[] = JSON.parse(new TextDecoder().decode(migrationData))
  if (migrations.length !== manifest.migrationCount) throw new Error('Migration count does not match the manifest')
  await pg.exec('CREATE ROLE clpr')
  post({ ev: 'progress', message: `Applying all ${migrations.length} Clpr migrations.` })
  for (const migration of migrations) {
    try { await pg.exec(migration.sql) } catch (error) { throw new Error(`${migration.name}: ${String(error)}`) }
  }
  // The prototype's eight labelled fixtures; all data and search analytics remain in this worker.
  const fixtures: [string, string, number][] = [
    ['speedrun world record attempt', 'runner_a', 41], ['chat reacts to the world record', 'streamer_b', 33],
    ['cooking stream goes wrong', 'chef_c', 12], ['clutch final round in ranked', 'pro_d', 58],
    ['world first raid clear', 'guild_e', 71], ['record breaking subathon finale', 'host_f', 22],
    ['rock and roll cover on stream', 'band_g', 9], ['c++ live coding session', 'dev_h', 15],
  ]
  for (const [i, [title, creator, votes]] of fixtures.entries()) {
    await pg.query(`INSERT INTO clips(twitch_clip_id,twitch_clip_url,embed_url,title,creator_name,broadcaster_name,created_at,vote_score)
      VALUES ($1,$2,$2,$3,$4,$4,timestamp '2026-11-01' + ($5 || ' hours')::interval,$6)`,
    [`fixture-${i}`, `https://example.invalid/clip/${i}`, title, creator, String(i * 7), votes])
  }
  await pg.exec('ANALYZE clips')
  post({ ev: 'progress', message: 'Starting Clpr’s Go search handler.' })
  const capture = captureDatabase(pg)
  globalThis.pglite = capture.proxy
  // Load the pinned toolchain's runtime as a same-origin module; no blob or eval is needed.
  await import(/* @vite-ignore */ artifactBase + 'wasm_exec.js')
  const go = new Go()
  const { instance } = await WebAssembly.instantiate(raw, go.importObject)
  void go.run(instance).then(() => fail('The Go search runtime stopped.'), fail)
  if (!globalThis.goReady) throw new Error('The Go search handler did not become ready')
  const version = (await pg.query<{ server_version: string }>('SHOW server_version')).rows[0].server_version
  post({ ev: 'ready', migrations: migrations.length, rows: fixtures.length, version })
  // PGlite's wire-protocol connection is single-client; serialize requests in this worker.
  let rows = fixtures.length
  serve(async (request) => {
    if (request.rows !== undefined) {
      await resizeClips(pg, request.rows)
      rows = (await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM clips')).rows[0].n
    }
    const url = `/api/v1/search?${new URLSearchParams({ q: request.words, type: 'clips' })}`
    capture.begin()
    const start = performance.now()
    const response = await goHandle('GET', url)
    const ms = performance.now() - start
    const calls = capture.finish()
    const statement = clipSearch(calls.flatMap(call => call.statements))
    let plan, planError
    if (statement) {
      try { plan = await inspectPlans(pg, statement, rows) }
      catch (error) { planError = error instanceof Error ? error.message : String(error) }
    }
    return { url, response, ms, calls, rows, plan, planError }
  })
}

void main().catch(fail)
