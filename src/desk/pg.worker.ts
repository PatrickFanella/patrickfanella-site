// PostgreSQL in a module worker, so seeding 50,008 rows and running the queries never touch the
// main thread, where the ink draws. PGlite is bundled from npm and served from this origin, so the
// worker runs under `worker-src 'self'`; WebAssembly still needs 'wasm-unsafe-eval' in script-src.
import { PGlite } from '@electric-sql/pglite'
import { SEARCH_SQL, COUNT_SQL, QUERY, type Run, type PgEvent } from './pg-protocol'

const post = (m: PgEvent) => postMessage(m)

async function explain(pg: PGlite, tsq: string): Promise<Run> {
  const r = await pg.query<{ 'QUERY PLAN': string }>(`EXPLAIN (ANALYZE, COSTS OFF, BUFFERS OFF) ${SEARCH_SQL}`, [tsq])
  const plan = r.rows.map((x) => x['QUERY PLAN'])
  const exec = /Execution Time: ([\d.]+) ms/.exec(plan.join('\n'))
  return { plan, exec: exec ? parseFloat(exec[1]) : NaN }
}

/** The middle of three runs, so one run slowed by a garbage collection or a cold cache does not set the figure. */
async function median3(pg: PGlite, tsq: string): Promise<Run> {
  const runs: Run[] = []
  for (let k = 0; k < 3; k++) runs.push(await explain(pg, tsq))
  return runs.sort((a, b) => a.exec - b.exec)[1]
}

async function main() {
  let t = performance.now()
  const pg = await PGlite.create()
  const version = (await pg.query<{ server_version: string }>('SHOW server_version')).rows[0].server_version
  post({ ev: 'ready', ms: performance.now() - t, version })

  // Clpr's search columns: the three moderation flags and the generated tsvector the GIN index covers.
  t = performance.now()
  await pg.exec(`CREATE TABLE clips (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, title text NOT NULL, creator_name text NOT NULL,
    vote_score int NOT NULL, created_at timestamptz NOT NULL,
    is_removed boolean NOT NULL DEFAULT false, is_hidden boolean NOT NULL DEFAULT false, dmca_removed boolean NOT NULL DEFAULT false,
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || creator_name)) STORED)`)
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
  const rows = (await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM clips')).rows[0].n
  post({ ev: 'seed', ms: performance.now() - t, rows })

  post({ ev: 'bench', kind: 'seq', run: await median3(pg, QUERY) })
  t = performance.now()
  await pg.exec('CREATE INDEX idx_clips_search_vector ON clips USING GIN (search_vector); ANALYZE clips;')
  post({ ev: 'index', ms: performance.now() - t })
  const idx = await median3(pg, QUERY)
  const found = (await pg.query<{ title: string; creator_name: string; vote_score: number }>(SEARCH_SQL, [QUERY])).rows
  const total = (await pg.query<{ n: number }>(COUNT_SQL, [QUERY])).rows[0].n
  post({ ev: 'bench', kind: 'idx', run: idx, rows: found.map((r) => ({ title: r.title, creator: r.creator_name, votes: r.vote_score })), total })
}

main().catch((err: unknown) => post({ ev: 'error', message: err instanceof Error ? err.message : String(err) }))
