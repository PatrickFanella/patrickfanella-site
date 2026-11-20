import { PGlite } from '@electric-sql/pglite'
import { expect, test } from 'vitest'
import { inspectPlans } from './plans'

test('GIN comparison restores all competing indexes and planner settings by rollback', async () => {
  const pg = await PGlite.create()
  try {
    await pg.exec(`CREATE TABLE clips(id int PRIMARY KEY, title text, search_vector tsvector, is_removed boolean DEFAULT false);
      INSERT INTO clips SELECT i, 'world record', to_tsvector('english', 'world record'), false FROM generate_series(1, 8) i;
      CREATE INDEX idx_clips_search_vector ON clips USING gin(search_vector);
      CREATE INDEX moderation ON clips(id) WHERE NOT is_removed;
      ANALYZE clips;`)
    const sample = await inspectPlans(pg, { kind: 'execute', sql: `SELECT c.id FROM clips c WHERE NOT c.is_removed
      AND c.search_vector @@ to_tsquery('english', $1) ORDER BY c.id LIMIT $2`,
    params: [{ format: 'text', value: 'world:* & record:*' }, { format: 'binary', value: '0000000000000014', oid: 20 }] }, 8)
    expect(JSON.stringify(sample.seq)).toContain('Seq Scan')
    expect(JSON.stringify(sample.gin)).toContain('idx_clips_search_vector')
    expect((await pg.query('SELECT indexname FROM pg_indexes WHERE tablename = \'clips\' ORDER BY indexname')).rows)
      .toEqual([{ indexname: 'clips_pkey' }, { indexname: 'idx_clips_search_vector' }, { indexname: 'moderation' }])
    expect((await pg.query('SHOW enable_seqscan')).rows).toEqual([{ enable_seqscan: 'on' }])
    expect((await pg.query('SHOW enable_indexscan')).rows).toEqual([{ enable_indexscan: 'on' }])
  } finally { await pg.close() }
}, 60_000)
