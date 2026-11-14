// Clpr's recorded run: its production search code against PGlite with all 155 of its migrations,
// recorded in headless Chrome 156 on 2026-11-14 (docs/prototypes/clpr-demo-2026-11-14/recorded.json).
// The desk shows it until PostgreSQL answers in the tab, and keeps it if PostgreSQL cannot start.
import type { Row, Run } from './pg-protocol'

export const RECORDED_ON = '14 Nov 2026'

/** Without the index: the last size at which the planner still chose a sequential scan. */
export const recordedSeq = { rows: 30_008, run: {
  exec: 14.55,
  plan: [
    'Limit  (cost=1934.18..1934.23 rows=20 width=890) (actual time=14.495..14.500 rows=2.00 loops=1)',
    '  ->  Sort  (cost=1934.18..1934.71 rows=209 width=890) (actual time=14.490..14.490 rows=2.00 loops=1)',
    '        ->  Seq Scan on clips c  (cost=0.00..1928.62 rows=209 width=890) (actual time=0.025..14.465 rows=2.00 loops=1)',
    '              Rows Removed by Filter: 30006',
    'Planning Time: 0.565 ms',
    'Execution Time: 14.550 ms',
  ],
} satisfies Run }

/** With the GIN index on search_vector, at 50,008 rows. */
export const recordedIdx = { rows: 50_008, total: 2, run: {
  exec: 3.495,
  plan: [
    'Limit  (cost=1494.37..1494.42 rows=20 width=891) (actual time=3.335..3.340 rows=2.00 loops=1)',
    '  ->  Sort  (cost=1494.37..1495.25 rows=352 width=891) (actual time=3.325..3.330 rows=2.00 loops=1)',
    '        ->  Bitmap Heap Scan on clips c  (cost=512.02..1485.01 rows=352 width=891) (actual time=3.270..3.295 rows=2.00 loops=1)',
    '              ->  Bitmap Index Scan on idx_clips_search_vector  (cost=0.00..511.93 rows=352 width=0) (actual time=3.215..3.215 rows=2.00 loops=1)',
    'Planning Time: 0.940 ms',
    'Execution Time: 3.495 ms',
  ],
} satisfies Run, found: [
  { title: 'speedrun world record attempt', creator: 'runner_a', votes: 41 },
  { title: 'chat reacts to the world record', creator: 'streamer_b', votes: 33 },
] satisfies Row[] }
