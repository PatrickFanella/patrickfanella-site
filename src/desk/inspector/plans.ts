import type { PGlite } from '@electric-sql/pglite'
import type { Statement } from './capture'
import type { Parameter } from './wire'
import { fixtureCount, tableSizes } from './recording.mjs'

export interface PlanNode {
  'Node Type': string; 'Total Cost': number; 'Startup Cost': number; 'Plan Rows': number
  'Index Name'?: string; Plans?: PlanNode[]
  [key: string]: unknown
}
interface QueryPlan { Plan: PlanNode; 'Execution Time': number; [key: string]: unknown }
export interface PlanSample { rows: number; natural: QueryPlan; seq: QueryPlan; gin: QueryPlan }

/** OIDs come from PostgreSQL's ParameterDescription, never from a value's length. */
function parameter(value: Parameter): string | null {
  if (value.value === null || value.format === 'text') return value.value
  const bytes = Uint8Array.from(value.value.match(/../g) ?? [], pair => parseInt(pair, 16))
  const view = new DataView(bytes.buffer)
  if (value.oid === 20 && bytes.length === 8) return String(view.getBigInt64(0))
  if (value.oid === 23 && bytes.length === 4) return String(view.getInt32(0))
  if (value.oid === 21 && bytes.length === 2) return String(view.getInt16(0))
  if (value.oid === 25 || value.oid === 1043) return new TextDecoder().decode(bytes)
  throw new Error(`Cannot explain binary parameter with OID ${value.oid ?? 'unknown'}`)
}

export function clipSearch(statements: Statement[]): Statement | undefined {
  return statements.find(statement => statement.kind === 'execute' && /\bFROM clips c\s+WHERE\b/i.test(statement.sql) && /\bORDER BY\b/i.test(statement.sql))
}

/** Each comparison uses the same captured production SQL and parameters. Alternatives
 * change planner switches locally; the GIN alternative temporarily removes competing
 * secondary indexes, then rolls back. The normal handler keeps its full schema. */
export async function inspectPlans(pg: PGlite, statement: Statement, rows: number): Promise<PlanSample> {
  const params = statement.params.map(parameter)
  const competitors = await pg.query<{ name: string }>(`SELECT quote_ident(i.relname) AS name
    FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
    WHERE x.indrelid = 'clips'::regclass AND i.relname <> 'idx_clips_search_vector'
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid)`)
  const explain = async (mode: 'natural' | 'seq' | 'gin'): Promise<QueryPlan> => pg.transaction(async tx => {
    if (mode !== 'natural') await tx.exec(`SET LOCAL enable_indexscan = off; SET LOCAL enable_indexonlyscan = off;
      SET LOCAL enable_bitmapscan = ${mode === 'gin' ? 'on' : 'off'};
      SET LOCAL enable_seqscan = ${mode === 'seq' ? 'on' : 'off'};`)
    // On eight rows, PostgreSQL can prefer a moderation index even with ordinary
    // index scans off (bitmap scans may use B-tree indexes too). Isolate GIN only
    // for this counterfactual, restoring every index without rebuilding it.
    if (mode === 'gin') for (const index of competitors.rows) await tx.exec(`DROP INDEX ${index.name}`)
    const result = await tx.query<{ 'QUERY PLAN': QueryPlan[] }>(`EXPLAIN (ANALYZE, FORMAT JSON) ${statement.sql}`, params)
    if (mode === 'gin') await tx.rollback()
    return result.rows[0]['QUERY PLAN'][0]
  })
  const natural = await explain('natural'), seq = await explain('seq'), gin = await explain('gin')
  if (!JSON.stringify(seq.Plan).includes('Seq Scan') || !JSON.stringify(gin.Plan).includes('idx_clips_search_vector')) {
    throw new Error('PostgreSQL did not produce both the sequential and GIN alternatives for this search.')
  }
  return { rows, natural, seq, gin }
}

/** Resize only this worker's generated data. The eight labelled fixtures survive.
 * Rewrite after both growth and shrink, then refresh statistics before planning. */
export async function resizeClips(pg: PGlite, rows: number) {
  if (!tableSizes.includes(rows)) throw new Error('Choose one of the offered table sizes')
  await pg.query("DELETE FROM clips WHERE twitch_clip_id LIKE 'synthetic-%'")
  if (rows > fixtureCount) await pg.query(`INSERT INTO clips(twitch_clip_id,twitch_clip_url,embed_url,title,creator_name,broadcaster_name,created_at,vote_score)
    SELECT 'synthetic-' || g, 'https://example.invalid/s/' || g, 'https://example.invalid/s/' || g,
      (ARRAY['speedrun','world','record','raid','ranked','cooking','music','clutch','finale','coding','reaction','highlight'])[1 + (g * 7) % 12] || ' ' ||
      (ARRAY['attempt','moment','clip','fail','win','session','stream','cover','round','run'])[1 + (g * 13) % 10] || ' ' || g,
      'synthetic_' || (g % 500), 'synthetic_' || (g % 500), timestamp '2026-01-01' + (g || ' minutes')::interval, (g * 31) % 100
    FROM generate_series(1, $1::int) g`, [rows - fixtureCount])
  // VACUUM cannot run inside a transaction. It also flushes the GIN pending list.
  await pg.exec('VACUUM FULL clips')
  await pg.exec('ANALYZE clips')
}
