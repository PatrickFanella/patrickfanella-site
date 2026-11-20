import { expect, test } from 'vitest'
import { compare, measured, scanName, tick, tidyPlan } from './benchmark'

test('a time is shown with the decimals its clock and batch size support', () => {
  // 25 runs on a 0.1 ms clock are good to 0.01 ms.
  expect(measured(3.4567, 0.1, 25)).toEqual({ text: '3.46', below: false, rough: false })
  // Within five bounds of zero a time is shown, but is too rough for a ratio.
  expect(measured(0.03, 0.1, 25)).toEqual({ text: '0.03', below: false, rough: true })
  expect(measured(0.004, 0.1, 25)).toEqual({ text: '< 0.01', below: true, rough: true })
  // One run on a 1 ms clock is good to 0.5 ms, so one decimal.
  expect(measured(12.44, 1)).toEqual({ text: '12.4', below: false, rough: false })
  expect(measured(0.3, 1)).toEqual({ text: '< 0.5', below: true, rough: true })
  // A clock coarser than 2 ms supports no decimals; a fine one never earns more than two.
  expect(measured(7.6, 4).text).toBe('8')
  expect(measured(1.23456, 0.005, 100).text).toBe('1.23')
})

test('the clock step is stated to one significant figure', () => {
  expect(tick(0.09999999999990905)).toBe(0.1)
  expect(tick(1)).toBe(1)
  expect(tick(0.005)).toBe(0.005)
})

test('a plan is named by how it reads the table', () => {
  expect(scanName(['Limit', '  ->  Seq Scan on clips c'])).toBe('seq scan')
  expect(scanName(['Limit', '  ->  Bitmap Heap Scan on clips c', '        ->  Bitmap Index Scan on idx_clips_search_vector'])).toBe('index scan')
  expect(scanName(['Result'])).toBe('scan')
})

test('a recorded plan loses its costs and loops and keeps its node times', () => {
  expect(tidyPlan({ exec: 14.55, plan: [
    'Limit  (cost=1934.18..1934.23 rows=20 width=890) (actual time=14.495..14.500 rows=2.00 loops=1)',
    '  ->  Sort  (cost=1934.18..1934.71 rows=209 width=890) (actual time=14.490..14.490 rows=2.00 loops=1)',
    '        Sort Key: vote_score DESC',
    '        ->  Seq Scan on clips c  (cost=0.00..1928.62 rows=209 width=890) (actual time=0.025..14.465 rows=2.00 loops=1)',
    '              Filter: (search_vector @@ $1)',
    '              Rows Removed by Filter: 30006',
    'Planning:',
    '  Buffers: shared hit=12',
    'Planning Time: 0.565 ms',
    'Execution Time: 14.550 ms',
  ] })).toEqual([
    ' Limit (actual time=14.495..14.500 rows=2)',
    '   -> Sort (actual time=14.490..14.490 rows=2)',
    '     -> Seq Scan on clips c (actual time=0.025..14.465 rows=2)',
    '          Rows Removed by Filter: 30006',
    ' Planning Time: 0.565 ms',
    ' Execution Time: 14.550 ms',
  ])
})

test('a measured plan drops node times and shows its times at the clock resolution', () => {
  const plan = [
    'Limit (actual time=0.000..0.000 rows=2.00 loops=1)',
    '  ->  Sort (actual time=0.000..0.000 rows=2.00 loops=1)',
    '        ->  Bitmap Heap Scan on clips c (actual time=0.000..0.000 rows=2.00 loops=1)',
    '              ->  Bitmap Index Scan on idx_clips_search_vector (actual time=0.000..0.000 rows=2.00 loops=1)',
    'Planning Time: 0.000 ms',
    'Execution Time: 0.000 ms',
  ]
  // Execution Time is the batch mean given beside the plan, not the 0.000 this one run read.
  expect(tidyPlan({ plan, exec: 3.4567, runs: 1250 }, 0.1)).toEqual([
    ' Limit (actual rows=2)',
    '   -> Sort (actual rows=2)',
    '     -> Bitmap Heap Scan on clips c (actual rows=2)',
    '       -> Bitmap Index Scan on idx_clips_search_vector (actual rows=2)',
    ' Planning Time: < 0.05 ms',
    ' Execution Time: 3.46 ms (mean of 1,250 runs)',
  ])
  expect(tidyPlan({ plan: ['Planning Time: 2.000 ms', 'Execution Time: 0.000 ms'], exec: 0.3 }, 1))
    .toEqual([' Planning Time: 2.0 ms', ' Execution Time: < 0.5 ms (mean of 1 run)'])
})

test('a plan with nothing to tidy only gains the gutter', () => {
  expect(tidyPlan({ exec: 0.34, plan: ['Result (actual rows=1)', 'Planning Time: 0.120 ms', 'Execution Time: 0.340 ms'] }))
    .toEqual([' Result (actual rows=1)', ' Planning Time: 0.120 ms', ' Execution Time: 0.340 ms'])
  expect(tidyPlan({ exec: 0, plan: [] })).toEqual([])
})

test('the comparison states a ratio to two significant figures', () => {
  expect(compare({ plan: [], exec: 12.34, runs: 4 }, { plan: [], exec: 0.487, runs: 100 }, 0.1, 50008)).toEqual({
    seq: '12.34', idx: '0.49', ratio: 'The index answers about 25 times faster on the same 50,008 rows.',
  })
})

test('an index scan slower than the sequential scan is said to be slower', () => {
  expect(compare({ plan: [], exec: 0.8, runs: 60 }, { plan: [], exec: 2, runs: 25 }, 0.1, 1008)).toEqual({
    seq: '0.80', idx: '2.00', ratio: 'The index answers about 2.5 times slower on the same 1,008 rows.',
  })
})

test('there is no ratio when either time is too close to the clock resolution', () => {
  const none = "One time is too close to what this tab's clock can resolve, so there is no ratio."
  // Shown as a number, yet within five bounds of zero.
  expect(compare({ plan: [], exec: 9.1, runs: 5 }, { plan: [], exec: 0.02, runs: 25 }, 0.1, 50008)).toEqual({ seq: '9.10', idx: '0.02', ratio: none })
  // A single run each on a 1 ms clock: the index time is under the bound.
  expect(compare({ plan: [], exec: 14 }, { plan: [], exec: 0.3 }, 1, 50008)).toEqual({ seq: '14.0', idx: '< 0.5', ratio: none })
})
