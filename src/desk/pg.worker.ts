// PostgreSQL in a module worker, so seeding 50,008 rows and running the queries never touch the
// main thread, where the ink draws. PGlite is bundled from npm and served from this origin, so the
// worker runs under `worker-src 'self'`; WebAssembly still needs 'wasm-unsafe-eval' in script-src.
import { PGlite } from '@electric-sql/pglite'
import { SEARCH_SQL, COUNT_SQL, QUERY, searchTerms, type PgRequest, type Run, type PgEvent } from './pg-protocol'

const post = (m: PgEvent) => postMessage({ ...m, at: performance.timeOrigin + performance.now() })
let queries = 0
post({ ev: 'worker' })

// When Emscripten cannot fetch or compile PGlite's WebAssembly, it rejects a promise inside
// PGlite.create() that nothing awaits, so create() never settles and main().catch never runs. The
// main thread's Worker.onerror does not see an unhandled rejection either, so report it from here.
self.addEventListener('unhandledrejection', (e) => post({ ev: 'error', message: String(e.reason) }))
self.addEventListener('error', (e) => post({ ev: 'error', message: e.message }))

async function explain(pg: PGlite, tsq: string): Promise<Run> {
  queries++
  const r = await pg.query<{ 'QUERY PLAN': string }>(`EXPLAIN (ANALYZE, COSTS OFF, BUFFERS OFF) ${SEARCH_SQL}`, [tsq])
  const plan = r.rows.map((x) => x['QUERY PLAN'])
  const exec = /Execution Time: ([\d.]+) ms/.exec(plan.join('\n'))
  return { plan, exec: exec ? parseFloat(exec[1]) : NaN }
}

/** How far apart this clock's readings are. Outside cross-origin isolation a worker's performance.now
 *  is coarse (0.1 ms in Chromium, 1 ms in Firefox and Safari), and PostgreSQL reads its clock from it. */
function clockStep(): number {
  const steps: number[] = []
  let last = performance.now()
  const end = last + 50
  while (steps.length < 9) {
    const now = performance.now()
    if (now > last) { steps.push(now - last); last = now }
    if (now > end) break
  }
  return steps.length ? steps.sort((a, b) => a - b)[steps.length >> 1] : 1
}

/** One batch: the query repeated for at least 50 ms, and the mean of PostgreSQL's Execution Times.
 *  Each time is rounded to the clock's step, but the runs start at arbitrary points between ticks, so
 *  the rounding averages out and the mean is finer than one tick. */
async function batch(pg: PGlite, tsq: string): Promise<Run> {
  const start = performance.now()
  let last: Run, sum = 0, n = 0
  do { last = await explain(pg, tsq); sum += last.exec; n++ } while (performance.now() - start < 50)
  return { plan: last.plan, exec: sum / n, runs: n }
}

/** The middle of three batches, so one batch slowed by a garbage collection or a cold cache does not set the figure. */
async function median3(pg: PGlite, tsq: string): Promise<Run> {
  const runs: Run[] = []
  for (let k = 0; k < 3; k++) runs.push(await batch(pg, tsq))
  const batches = runs.map((r) => r.exec)
  return { ...runs.sort((a, b) => a.exec - b.exec)[1], batches }
}

async function main() {
  let t = performance.now()
  const pg = await PGlite.create()
  queries++
  const version = (await pg.query<{ server_version: string }>('SHOW server_version')).rows[0].server_version
  post({ ev: 'ready', ms: performance.now() - t, version, step: clockStep() })

  // Clpr's search columns: the three moderation flags and the generated tsvector the GIN index covers.
  t = performance.now()
  queries++
  await pg.exec(`CREATE TABLE clips (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, title text NOT NULL, creator_name text NOT NULL,
    vote_score int NOT NULL, created_at timestamptz NOT NULL,
    is_removed boolean NOT NULL DEFAULT false, is_hidden boolean NOT NULL DEFAULT false, dmca_removed boolean NOT NULL DEFAULT false,
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || creator_name)) STORED)`)
  post({ ev: 'schema', ms: performance.now() - t })
  t = performance.now()
  queries += 3 // Two INSERTs and ANALYZE below.
  // 50,006 titles generated from three word lists, none containing "record", then the two rows the query finds.
  await pg.exec(`INSERT INTO clips (title, creator_name, vote_score, created_at)
    SELECT (ARRAY['clutch','insane','speedrun','boss','final','ranked','late','first','lucky','perfect','secret','sudden'])[1 + i % 12] || ' ' ||
           (ARRAY['fight','raid','round','jump','glitch','win','fail','combo','save','play','escape','comeback'])[1 + (i / 12) % 12] || ' ' ||
           (ARRAY['world','stream','chat','lobby','tournament','run','match','night','squad','duo','finale','rematch'])[1 + (i / 144) % 12],
           'creator_' || (i % 977), (i * 31) % 500, now() - (i || ' minutes')::interval
      FROM generate_series(1, 50006) AS i;
    INSERT INTO clips (title, creator_name, vote_score, created_at) VALUES
      ('speedrun world record attempt', 'runner_a', 41, now()), ('chat reacts to the world record', 'streamer_b', 33, now());
    ANALYZE clips;`)
  queries++
  const rows = (await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM clips')).rows[0].n
  post({ ev: 'seed', ms: performance.now() - t, rows })

  post({ ev: 'bench', kind: 'seq', run: await median3(pg, QUERY) })
  t = performance.now()
  queries += 2
  await pg.exec('CREATE INDEX idx_clips_search_vector ON clips USING GIN (search_vector); ANALYZE clips;')
  post({ ev: 'index', ms: performance.now() - t })
  const idx = await median3(pg, QUERY)
  queries++
  const found = (await pg.query<{ title: string; creator_name: string; vote_score: number }>(SEARCH_SQL, [QUERY])).rows
  queries++
  const total = (await pg.query<{ n: number }>(COUNT_SQL, [QUERY])).rows[0].n

  const stats = async () => {
    queries++
    const bytes = (await pg.query<{ bytes: number }>('SELECT pg_database_size(current_database())::float8 AS bytes')).rows[0].bytes
    post({ ev: 'stats', bytes, queries })
  }
  // Serialize requests so the displayed plan, rows and count always belong to one search.
  let queue = Promise.resolve()
  self.onmessage = (event: MessageEvent<PgRequest>) => {
    const request = event.data
    queue = queue.then(async () => {
      try {
        if (request.ev === 'stats') { await stats(); return }
        const query = searchTerms(request.words)
        if (!query) throw new Error('Use search followed by words or numbers.')
        const run = await batch(pg, query)
        queries++
        const matches = (await pg.query<{ title: string; creator_name: string; vote_score: number }>(SEARCH_SQL, [query])).rows
        queries++
        const count = (await pg.query<{ n: number }>(COUNT_SQL, [query])).rows[0].n
        post({ ev: 'search', id: request.id, query, run, total: count,
          rows: matches.map((r) => ({ title: r.title, creator: r.creator_name, votes: r.vote_score })) })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (request.ev === 'search') post({ ev: 'search-error', id: request.id, message })
        else post({ ev: 'error', message })
      }
    })
  }
  // Publish readiness only after the request listener exists.
  post({ ev: 'bench', kind: 'idx', run: idx, rows: found.map((r) => ({ title: r.title, creator: r.creator_name, votes: r.vote_score })), total })
  await stats()
}

main().catch((err: unknown) => post({ ev: 'error', message: err instanceof Error ? err.message : String(err) }))
