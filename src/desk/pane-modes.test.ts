import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { startModes, type ClprResult, type ModeWorker, type View } from './pane-modes'
import type { PgEvent, PgRequest, Run } from './pg-protocol'
import type { ClprEvent, ClprRequest } from './clpr-protocol'

// Fixture workers and fixture events: these exercise the modes, not PostgreSQL or Clpr.
class FixtureWorker<Request, Event> implements ModeWorker<Request, Event> {
  onmessage: ((event: MessageEvent<Event>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  sent: Request[] = []
  terminated = false
  postMessage(message: Request) { this.sent.push(message) }
  terminate() { this.terminated = true }
  // A terminated worker can still deliver: its callback may already be queued.
  emit(data: Event) { this.onmessage?.({ data } as MessageEvent<Event>) }
  fail(message = 'fixture worker failed') { this.onerror?.({ message, preventDefault() {} } as ErrorEvent) }
}

function desk(gate = { allowed: true, reason: '' }) {
  const pg: FixtureWorker<PgRequest, PgEvent>[] = [], clpr: FixtureWorker<ClprRequest, ClprEvent>[] = []
  const log: PgEvent[] = []
  let view!: View
  const modes = startModes({
    gate, build: { commit: '0123456789abcdef', migrationCount: 155 },
    pgWorker: () => { const worker = new FixtureWorker<PgRequest, PgEvent>(); pg.push(worker); return worker },
    clprWorker: () => { const worker = new FixtureWorker<ClprRequest, ClprEvent>(); clpr.push(worker); return worker },
    render: next => { view = next },
    onPgEvent: event => log.push(event),
  })
  return { modes, pg, clpr, log, get view() { return view } }
}

const idx: Run = { plan: ['Bitmap Index Scan on idx_clips_search_vector', 'Execution Time: 2.0 ms'], exec: 2, runs: 25, batches: [1, 2, 3] }
const seq: Run = { plan: ['Seq Scan on clips c', 'Execution Time: 10.0 ms'], exec: 10, runs: 5, batches: [9, 10, 11] }
const match = { title: 'fixture match', creator: 'fixture', votes: 1 }
function finishSql(worker: FixtureWorker<PgRequest, PgEvent>) {
  worker.emit({ ev: 'ready', ms: 1200.4, version: '18.6', step: .1 })
  worker.emit({ ev: 'seed', ms: 340, rows: 50008 })
  worker.emit({ ev: 'bench', kind: 'seq', run: seq })
  worker.emit({ ev: 'index', ms: 80 })
  worker.emit({ ev: 'bench', kind: 'idx', run: idx, rows: [match], total: 1 })
}
const clips = (titles: string[]) => JSON.stringify({ counts: { clips: titles.length }, results: { clips: titles.map(title => ({ title })) } })
const result = (id: number, body = clips(['speedrun world record attempt', 'chat reacts to the world record']), status = 200, rows = 8): ClprResult =>
  ({ ev: 'result', id, url: '/api/v1/search?q=world+record', response: { status, headers: {}, body }, ms: 12.34, calls: [], rows })
const ready: ClprEvent = { ev: 'ready', migrations: 155, rows: 8, version: '18.6' }
/** Live Clpr with its startup search answered. */
async function liveClpr(d: ReturnType<typeof desk>) {
  d.modes.startLive()
  d.clpr[0].emit(ready)
  d.clpr[0].emit(result(1))
  await settled()
}
/** Let promise callbacks run. */
const settled = () => new Promise<void>(resolve => queueMicrotask(resolve)).then(() => Promise.resolve())

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {}) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

test('the pane opens on the recorded run and starts no worker', () => {
  const d = desk()
  expect(d.pg).toHaveLength(0)
  expect(d.clpr).toHaveLength(0)
  expect(d.view).toMatchObject({
    mode: 'recorded', phase: 'idle', sub: 'recorded run', live: null,
    status: 'Recorded evidence below. Start live mode to run Clpr’s Go search handler here.',
    stopLabel: 'Stop live mode', canStart: true, canExample: true, canStop: false,
  })
  expect(d.view.bench).toEqual({
    cap: "Recorded on Clpr's demo, 14 Nov 2026", seqHidden: false, seqNote: 'seq scan, 30,008 rows', idxNote: 'index scan, 50,008 rows',
    seq: '14.55', idx: '3.50', bars: [14.55, 3.495],
    note: 'Choose Clpr live mode to run the Go handler, or the SQL benchmark to compare index timings.',
  })
  expect(d.view.session).toMatchObject({ query: "'world':* & 'record':*", status: "recorded run from Clpr's demo, 14 Nov 2026" })
  expect(d.view.session.shown).toMatchObject({ total: 2, of: 50008 })
})

test('a search needs a running mode', async () => {
  await expect(desk().modes.search('world record')).rejects.toThrow('Start Clpr live mode or the SQL benchmark in the psql pane first.')
})

test('a closed gate keeps live mode off and says why', () => {
  const d = desk({ allowed: false, reason: 'Clpr live mode is off: fixture reason.' })
  expect(d.view).toMatchObject({ status: 'Clpr live mode is off: fixture reason.', canStart: false, canExample: false })
  d.modes.startBenchmark()
  d.modes.example('world record')
  d.modes.startLive()
  expect(d.clpr).toHaveLength(0)
  expect(d.view).toMatchObject({ mode: 'benchmark', phase: 'starting', status: 'Clpr live mode is off: fixture reason.' })
})

test('the SQL benchmark reports each step and completes on the measured comparison', () => {
  const d = desk()
  d.modes.startBenchmark()
  expect(d.pg).toHaveLength(1)
  expect(d.view).toMatchObject({
    mode: 'benchmark', phase: 'starting', sub: 'recorded run', stopLabel: 'Stop SQL benchmark', canStop: true, canStart: true, live: null,
    status: 'Running the SQL benchmark on generated clips. This mode runs SQL directly; recorded times remain until completion.',
  })
  expect(d.view.bench.note).toBe("PostgreSQL is starting in this tab. Until it answers, these are Clpr's recorded times.")
  expect(d.view.bench.seq).toBe('14.55')
  expect(d.view.session.status).toBe("recorded run from Clpr's demo, 14 Nov 2026. Starting PostgreSQL in this tab.")
  const recorded = d.view.session.shown
  const worker = d.pg[0]
  worker.emit({ ev: 'worker' })
  expect(d.view.status).toBe('Running the SQL benchmark on generated clips. This mode runs SQL directly; recorded times remain until completion.')
  worker.emit({ ev: 'ready', ms: 1200.4, version: '18.6', step: .1 })
  expect(d.view.status).toBe('SQL benchmark: PostgreSQL 18.6 is up in 1,200 ms; inserting clips. The output still shows recorded evidence until completion.')
  expect(d.view.session.status).toBe("recorded run from Clpr's demo, 14 Nov 2026. PostgreSQL 18.6 is up in 1,200 ms; inserting clips.")
  worker.emit({ ev: 'seed', ms: 340, rows: 50008 })
  expect(d.view.status).toBe('SQL benchmark: Inserted 50,008 generated clips in 340 ms; timing the query. The output still shows recorded evidence until completion.')
  worker.emit({ ev: 'bench', kind: 'seq', run: seq })
  expect(d.view.status).toBe('SQL benchmark: Without the index: 10.00 ms. Building the GIN index. The output still shows recorded evidence until completion.')
  worker.emit({ ev: 'index', ms: 80 })
  expect(d.view.status).toBe('SQL benchmark: Built the GIN index in 80 ms; timing the query again. The output still shows recorded evidence until completion.')
  // Until the comparison arrives the pane still shows the recorded run, with only its last line changed.
  expect(d.view).toMatchObject({ phase: 'starting', sub: 'recorded run' })
  expect(d.view.session.shown).toBe(recorded)
  worker.emit({ ev: 'bench', kind: 'idx', run: idx, rows: [match], total: 1 })
  expect(d.view).toMatchObject({
    mode: 'benchmark', phase: 'live', sub: 'live in this tab, PostgreSQL 18.6', canStop: true,
    status: 'SQL benchmark complete on 50,008 generated clips. Direct SQL, measured in this tab; ready for a shell search.',
  })
  expect(d.view.bench).toEqual({
    cap: 'Measured in this tab, median of 3 batches', seqHidden: false, seqNote: 'seq scan, 50,008 rows', idxNote: 'index scan, 50,008 rows',
    seq: '10.00', idx: '2.00', bars: [10, 2], batches: ['9 10 11', '1 2 3'],
    note: "The index answers about 5 times faster on the same 50,008 rows. This tab's clock ticks every 0.1 ms, so each batch repeats the query for 50 ms and takes the mean. Clpr's recorded demo: 14.55 ms without the index at 30,008 rows, 3.50 ms with it at 50,008.",
  })
  expect(d.view.session).toEqual({
    shown: { run: idx, rows: [match], total: 1, of: 50008, step: .1 }, query: "'world':* & 'record':*",
    status: "measured in this tab by PostgreSQL 18.6: the plan of the median batch's last run, on a clock that ticks every 0.1 ms",
  })
  // The startup log hears every event of the current worker.
  expect(d.log.map(event => event.ev)).toEqual(['worker', 'ready', 'seed', 'bench', 'index', 'bench'])
})

test('after 30 s without PostgreSQL the SQL benchmark says it is still loading, and a later answer still counts', () => {
  const d = desk()
  d.modes.startBenchmark()
  vi.advanceTimersByTime(29_999)
  expect(d.view.phase).toBe('starting')
  vi.advanceTimersByTime(1)
  expect(d.view).toMatchObject({
    mode: 'benchmark', phase: 'slow', canStop: true,
    status: 'SQL benchmark: PostgreSQL is still loading in this tab. The output still shows recorded evidence until completion.',
  })
  expect(d.view.bench.note).toBe("PostgreSQL is still loading in this tab. Until it answers, these are Clpr's recorded times.")
  expect(d.view.session.status).toBe("recorded run from Clpr's demo, 14 Nov 2026. PostgreSQL is still loading in this tab.")
  finishSql(d.pg[0])
  expect(d.view).toMatchObject({ phase: 'live', status: 'SQL benchmark complete on 50,008 generated clips. Direct SQL, measured in this tab; ready for a shell search.' })
})

test('PostgreSQL answering within 30 s cancels the still-loading notice', () => {
  const d = desk()
  d.modes.startBenchmark()
  d.pg[0].emit({ ev: 'ready', ms: 1, version: '18.6', step: .1 })
  vi.advanceTimersByTime(60_000)
  expect(d.view).toMatchObject({ phase: 'starting', status: 'SQL benchmark: PostgreSQL 18.6 is up in 1 ms; inserting clips. The output still shows recorded evidence until completion.' })
})

test('a shell search waits for the SQL benchmark, then reports matches, no match and failure, and can be retried', async () => {
  const d = desk()
  d.modes.startBenchmark()
  await expect(d.modes.search('world record')).rejects.toThrow('PostgreSQL is still starting. Try the search again when the psql pane says live.')
  finishSql(d.pg[0])
  await expect(d.modes.search('???')).rejects.toThrow('Use search followed by words or numbers.')
  expect(d.pg[0].sent).toEqual([])

  const none = d.modes.search('absent')
  expect(d.pg[0].sent).toEqual([{ ev: 'search', id: 1, words: 'absent' }])
  expect(d.view).toMatchObject({ phase: 'live', canStop: true, status: 'Running a direct SQL search on generated clips in this tab.' })
  d.pg[0].emit({ ev: 'result', id: 1, query: "'absent':*", run: idx, rows: [], total: 0 })
  await expect(none).resolves.toEqual({ total: 0, time: '2.00', top: undefined })
  expect(d.view.status).toBe('SQL search complete: 0 matches in 50,008 generated clips. Direct SQL, measured in this tab.')
  // The comparison belonged to the first query, so its row is hidden and the indexed row describes this search.
  expect(d.view.bench).toMatchObject({
    cap: 'Your search, measured in this tab', seqHidden: true, idx: '2.00', idxNote: 'index scan, 50,008 rows',
    note: "Prefix search with AND; 0 matches. Mean of 25 query runs, at this tab's clock resolution.",
  })
  expect(d.view.session).toEqual({
    shown: { run: idx, rows: [], total: 0, of: 50008, step: .1 }, query: "'absent':*",
    status: 'measured in this tab by PostgreSQL 18.6; prefix terms joined with AND',
  })

  const failed = d.modes.search('retry')
  d.pg[0].emit({ ev: 'error', id: 2, message: 'fixture search failed' })
  await expect(failed).rejects.toThrow('fixture search failed')
  expect(d.view).toMatchObject({ phase: 'live', canStop: true, status: 'SQL search failed. The last output remains; try another search.' })
  expect(d.view.session.query).toBe("'absent':*")

  const one = d.modes.search('retry')
  d.pg[0].emit({ ev: 'result', id: 3, query: "'retry':*", run: idx, rows: [match], total: 1 })
  await expect(one).resolves.toEqual({ total: 1, time: '2.00', top: 'fixture match' })
  expect(d.view.status).toBe('SQL search complete: 1 match in 50,008 generated clips. Direct SQL, measured in this tab.')
  // A reply nobody is waiting for changes nothing.
  d.pg[0].emit({ ev: 'result', id: 3, query: "'stale':*", run: idx, rows: [], total: 0 })
  expect(d.view.session.query).toBe("'retry':*")
})

test('a live SQL benchmark is asked for its statistics every second', () => {
  const d = desk()
  d.modes.startBenchmark()
  vi.advanceTimersByTime(2000)
  expect(d.pg[0].sent).toEqual([])
  finishSql(d.pg[0])
  vi.advanceTimersByTime(2000)
  expect(d.pg[0].sent).toEqual([{ ev: 'stats' }, { ev: 'stats' }])
  d.modes.stop()
  vi.advanceTimersByTime(2000)
  expect(d.pg[0].sent).toHaveLength(2)
})

test('stopping the SQL benchmark returns to the recorded run, rejects its searches and ignores what the worker sends later', async () => {
  const d = desk()
  d.modes.startBenchmark()
  finishSql(d.pg[0])
  const search = d.modes.search('world record')
  d.modes.stop()
  await expect(search).rejects.toThrow('The SQL benchmark stopped.')
  expect(d.pg[0].terminated).toBe(true)
  const stopped = d.view
  expect(stopped).toMatchObject({
    mode: 'recorded', phase: 'idle', sub: 'recorded run', stopLabel: 'Stop live mode', canStop: false,
    status: 'SQL benchmark stopped. The psql pane shows the recorded run.',
  })
  expect(stopped.bench).toMatchObject({ cap: "Recorded on Clpr's demo, 14 Nov 2026", seqHidden: false, idx: '3.50', note: 'Choose Clpr live mode to run the Go handler, or the SQL benchmark to compare index timings.' })
  expect(stopped.session.status).toBe("recorded run from Clpr's demo, 14 Nov 2026")
  const heard = d.log.length
  d.pg[0].emit({ ev: 'result', id: 1, query: "'world':* & 'record':*", run: idx, rows: [match], total: 1 })
  d.pg[0].emit({ ev: 'error', message: 'stale SQL failure' })
  d.pg[0].fail('stale SQL failure')
  vi.advanceTimersByTime(60_000)
  expect(d.view).toBe(stopped)
  expect(d.log).toHaveLength(heard)
  await expect(d.modes.search('world record')).rejects.toThrow('Start Clpr live mode or the SQL benchmark in the psql pane first.')
})

test('a stop before PostgreSQL answers cancels the still-loading notice', () => {
  const d = desk()
  d.modes.startBenchmark()
  d.modes.stop()
  vi.advanceTimersByTime(60_000)
  expect(d.view).toMatchObject({ mode: 'recorded', phase: 'idle', status: 'SQL benchmark stopped. The psql pane shows the recorded run.' })
})

test.each([
  ['an error event', (worker: FixtureWorker<PgRequest, PgEvent>) => worker.emit({ ev: 'error', message: 'fixture failure' }), 'fixture failure'],
  ['a worker that fails', (worker: FixtureWorker<PgRequest, PgEvent>) => worker.fail('fixture failure'), 'fixture failure'],
  ['a worker script that does not load', (worker: FixtureWorker<PgRequest, PgEvent>) => worker.fail(''), 'The worker did not load'],
])('the SQL benchmark fails on %s, keeps the recorded times and can be retried', async (_name, break_, why) => {
  const d = desk()
  d.modes.startBenchmark()
  finishSql(d.pg[0])
  const search = d.modes.search('world record')
  break_(d.pg[0])
  await expect(search).rejects.toThrow('PostgreSQL is unavailable in this tab.')
  expect(d.pg[0].terminated).toBe(true)
  expect(d.view).toMatchObject({
    mode: 'benchmark', phase: 'failed', sub: 'recorded run', stopLabel: 'Stop SQL benchmark', canStop: false, canStart: true,
    status: 'SQL benchmark failed. These are recorded times; use Run SQL benchmark to retry.',
  })
  expect(d.view.bench).toMatchObject({ cap: "Recorded on Clpr's demo, 14 Nov 2026", seq: '14.55', note: "PostgreSQL could not start in this tab, so these are Clpr's recorded times." })
  expect(d.view.session.status).toBe("recorded run from Clpr's demo, 14 Nov 2026. PostgreSQL could not start in this tab.")
  expect(d.log.at(-1)).toEqual({ ev: 'error', message: why })
  expect(console.info).toHaveBeenCalledWith('PostgreSQL is off:', why)
  await expect(d.modes.search('world record')).rejects.toThrow('PostgreSQL is unavailable in this tab; the psql pane shows a recorded run.')
  // A failed worker is as stale as a stopped one.
  const failed = d.view
  finishSql(d.pg[0])
  expect(d.view).toBe(failed)

  d.modes.startBenchmark()
  expect(d.pg).toHaveLength(2)
  finishSql(d.pg[1])
  expect(d.view).toMatchObject({ phase: 'live', status: 'SQL benchmark complete on 50,008 generated clips. Direct SQL, measured in this tab; ready for a shell search.' })
})

test('a worker that cannot be created fails its mode', () => {
  const view: View[] = []
  const refuse = () => { throw new Error('no workers here') }
  const modes = startModes({ gate: { allowed: true, reason: '' }, build: { commit: '0123456789abcdef', migrationCount: 155 }, pgWorker: refuse, clprWorker: refuse, render: next => view.push(next) })
  modes.startBenchmark()
  expect(view.at(-1)).toMatchObject({ mode: 'benchmark', phase: 'failed', status: 'SQL benchmark failed. These are recorded times; use Run SQL benchmark to retry.' })
  expect(console.info).toHaveBeenCalledWith('PostgreSQL is off:', 'Error: no workers here')
  modes.startLive()
  expect(view.at(-1)).toMatchObject({ mode: 'clpr', phase: 'failed', status: 'Clpr could not run in this tab. The recorded run is still available; retry with Start Clpr live mode.' })
  expect(console.info).toHaveBeenCalledWith('Clpr live mode is off:', 'Error: no workers here')
})

test('Clpr live mode reports its download, goes live and shows its first search', async () => {
  const d = desk()
  d.modes.startLive()
  expect(d.clpr).toHaveLength(1)
  expect(d.view).toMatchObject({
    mode: 'clpr', phase: 'starting', sub: 'recorded run', stopLabel: 'Stop live mode', live: null,
    canStart: false, canExample: false, canStop: true,
    status: 'Downloading the pinned Clpr build and starting PostgreSQL.',
  })
  await expect(d.modes.search('world record')).rejects.toThrow('Clpr is still starting. Try again when live mode is ready.')
  d.clpr[0].emit({ ev: 'progress', message: 'Applying migrations.' })
  expect(d.view).toMatchObject({ phase: 'starting', status: 'Applying migrations.' })
  d.clpr[0].emit(ready)
  // The fixture request goes out at once, so its status replaces the ready line.
  expect(d.clpr[0].sent).toEqual([{ ev: 'search', id: 1, words: 'world record', rows: undefined }])
  expect(d.view).toMatchObject({
    mode: 'clpr', phase: 'live', sub: 'Clpr 0123456, live in this tab', live: null, canStart: false, canExample: false, canStop: true,
    status: 'Running Clpr’s Go search handler on fixture clips and any generated clips in this tab.',
  })
  const first = result(1)
  d.clpr[0].emit(first)
  expect(d.view.live).toBe(first)
  expect(d.view.status).toBe('Clpr search complete: 2 matches. Clpr is live: all 155 migrations applied, 8 fixture clips and 0 generated clips. Go handler request measured in this tab.')
  await settled()
  expect(d.view).toMatchObject({ phase: 'live', canExample: true, canStart: false })
})

test('after 30 s Clpr says it is still loading; going live cancels the notice', () => {
  const d = desk()
  d.modes.startLive()
  vi.advanceTimersByTime(30_000)
  expect(d.view).toMatchObject({ mode: 'clpr', phase: 'starting', canStop: true, status: 'Clpr is still loading. The recorded run remains below; Stop live mode cancels the download.' })
  d.modes.stop()
  d.modes.startLive()
  d.clpr[1].emit(ready)
  vi.advanceTimersByTime(60_000)
  expect(d.view.status).toBe('Running Clpr’s Go search handler on fixture clips and any generated clips in this tab.')
})

test('a Clpr search reports matches, no match and a bad response, and only the latest search is shown', async () => {
  const d = desk()
  await liveClpr(d)
  await expect(d.modes.search('   ')).rejects.toThrow('Use search followed by words or numbers.')

  const none = d.modes.search('absent')
  expect(d.clpr[0].sent.at(-1)).toEqual({ ev: 'search', id: 2, words: 'absent', rows: undefined })
  expect(d.view.status).toBe('Running Clpr’s Go search handler on fixture clips and any generated clips in this tab.')
  const empty = result(2, clips([]), 200, 1008)
  d.clpr[0].emit(empty)
  await expect(none).resolves.toEqual({ total: 0, top: undefined, time: '12.3', timing: 'Clpr request time' })
  expect(d.view.live).toBe(empty)
  expect(d.view.status).toBe('Clpr search complete: 0 matches. Clpr is live: all 155 migrations applied, 8 fixture clips and 1,000 generated clips. Go handler request measured in this tab.')

  const refused = d.modes.search('refused')
  const error = result(3, '{"error":"fixture"}', 500)
  d.clpr[0].emit(error)
  await expect(refused).rejects.toThrow('Clpr returned HTTP 500; see its JSON response in the psql pane.')
  expect(d.view).toMatchObject({ phase: 'live', live: error, status: 'Clpr search failed; inspect its response or try another search.' })

  const odd = d.modes.search('odd')
  d.clpr[0].emit(result(4, '{"counts":{}}'))
  await expect(odd).rejects.toThrow('Clpr returned an unexpected response')
  const odder = d.modes.search('odder')
  d.clpr[0].emit(result(5, '{"counts":{"clips":"2"},"results":{"clips":[]}}'))
  await expect(odder).rejects.toThrow('Clpr returned unexpected clip results')

  // Two searches at once: the earlier one answers its caller but is not shown.
  const earlier = d.modes.search('earlier'), later = d.modes.search('later')
  d.clpr[0].emit(result(6, clips(['an earlier clip'])))
  await expect(earlier).resolves.toMatchObject({ total: 1, top: 'an earlier clip' })
  expect(d.view.live?.id).toBe(5)
  expect(d.view.status).toBe('Running Clpr’s Go search handler on fixture clips and any generated clips in this tab.')
  const shown = result(7, clips(['a later clip']))
  d.clpr[0].emit(shown)
  await expect(later).resolves.toMatchObject({ total: 1, top: 'a later clip' })
  expect(d.view.live).toBe(shown)
  expect(d.view.status).toBe('Clpr search complete: 1 match. Clpr is live: all 155 migrations applied, 8 fixture clips and 0 generated clips. Go handler request measured in this tab.')
})

test('a response the page cannot render fails that search', async () => {
  const bad = result(2)
  const view: View[] = []
  const worker = new FixtureWorker<ClprRequest, ClprEvent>()
  const modes = startModes({
    gate: { allowed: true, reason: '' }, build: { commit: '0123456789abcdef', migrationCount: 155 },
    pgWorker: () => new FixtureWorker(), clprWorker: () => worker,
    render: next => { view.push(next); if (view.at(-2)?.live !== bad && next.live === bad) throw new Error('cannot render') },
  })
  modes.startLive(); worker.emit(ready); worker.emit(result(1)); await settled()
  const search = modes.search('unrenderable')
  worker.emit(bad)
  await expect(search).rejects.toThrow('cannot render')
  expect(view.at(-1)).toMatchObject({ phase: 'live', status: 'Clpr search failed; inspect its response or try another search.' })
})

test('the Plan tab re-runs the last Clpr search on another number of clips', async () => {
  const d = desk()
  await liveClpr(d)
  void d.modes.search('clutch fight').catch(() => {})
  void d.modes.resize(10008).catch(() => {})
  expect(d.clpr[0].sent.slice(1)).toEqual([{ ev: 'search', id: 2, words: 'clutch fight', rows: undefined }, { ev: 'search', id: 3, words: 'clutch fight', rows: 10008 }])
  d.modes.stop()
  await expect(d.modes.resize(10008)).rejects.toThrow('Start Clpr live mode to run the Go search handler.')
})

test('stopping Clpr live mode returns to the recorded run, rejects its searches and ignores what the worker sends later', async () => {
  const d = desk()
  await liveClpr(d)
  const search = d.modes.search('world record')
  d.modes.stop()
  await expect(search).rejects.toThrow('Clpr live mode stopped.')
  expect(d.clpr[0].terminated).toBe(true)
  const stopped = d.view
  expect(stopped).toMatchObject({
    mode: 'recorded', phase: 'idle', sub: 'recorded run', live: null, canStart: true, canExample: true, canStop: false,
    status: 'Live mode stopped. The psql pane shows the recorded run.',
  })
  d.clpr[0].emit(result(2))
  d.clpr[0].emit({ ev: 'progress', message: 'stale Clpr progress' })
  d.clpr[0].emit({ ev: 'error', message: 'stale Clpr failure' })
  d.clpr[0].fail('stale Clpr failure')
  vi.advanceTimersByTime(60_000)
  await settled()
  expect(d.view).toEqual(stopped)
  await expect(d.modes.search('world record')).rejects.toThrow('Start Clpr live mode or the SQL benchmark in the psql pane first.')
})

test('stopping during the first search is a cancellation, not a failure', async () => {
  const d = desk()
  d.modes.startLive()
  d.clpr[0].emit(ready)
  d.modes.stop()
  await settled()
  expect(d.view).toMatchObject({ mode: 'recorded', phase: 'idle', canExample: true, status: 'Live mode stopped. The psql pane shows the recorded run.' })
})

test.each([
  ['an error event', (worker: FixtureWorker<ClprRequest, ClprEvent>) => worker.emit({ ev: 'error', message: 'fixture failure' }), 'fixture failure'],
  ['a worker that fails', (worker: FixtureWorker<ClprRequest, ClprEvent>) => worker.fail('fixture failure'), 'fixture failure'],
  ['a request that fails', (worker: FixtureWorker<ClprRequest, ClprEvent>) => worker.emit({ ev: 'error', id: 2, message: 'fixture failure' }), 'fixture failure'],
  ['a worker script that does not load', (worker: FixtureWorker<ClprRequest, ClprEvent>) => worker.fail(''), 'The worker did not load'],
])('Clpr live mode fails on %s, keeps the recorded run and can be retried', async (_name, break_, why) => {
  const d = desk()
  await liveClpr(d)
  const search = d.modes.search('world record')
  break_(d.clpr[0])
  await expect(search).rejects.toThrow('Clpr live mode stopped.')
  expect(d.clpr[0].terminated).toBe(true)
  expect(d.view).toMatchObject({
    mode: 'clpr', phase: 'failed', sub: 'recorded run', live: null, stopLabel: 'Stop live mode', canStart: true, canExample: true, canStop: false,
    status: 'Clpr could not run in this tab. The recorded run is still available; retry with Start Clpr live mode.',
  })
  expect(console.info).toHaveBeenCalledWith('Clpr live mode is off:', why)
  await expect(d.modes.search('world record')).rejects.toThrow('Start Clpr live mode to run the Go search handler.')
  const failed = d.view
  d.clpr[0].emit(ready)
  expect(d.view).toBe(failed)

  d.modes.startLive()
  d.clpr[1].emit(ready)
  // Each worker's requests are numbered from 1; the old worker's reply to the same number does not count.
  expect(d.clpr[1].sent).toEqual([{ ev: 'search', id: 1, words: 'world record', rows: undefined }])
  const waiting = d.view
  d.clpr[0].emit(result(1, clips([])))
  expect(d.view).toBe(waiting)
  d.clpr[1].emit(result(1))
  expect(d.view).toMatchObject({ phase: 'live', status: 'Clpr search complete: 2 matches. Clpr is live: all 155 migrations applied, 8 fixture clips and 0 generated clips. Go handler request measured in this tab.' })
})

test('a first search that fails ends live mode', async () => {
  const d = desk()
  d.modes.startLive()
  d.clpr[0].emit(ready)
  d.clpr[0].emit(result(1, '{"error":"fixture"}', 500))
  expect(d.view.status).toBe('Clpr search failed; inspect its response or try another search.')
  await settled()
  expect(d.clpr[0].terminated).toBe(true)
  expect(d.view).toMatchObject({ mode: 'clpr', phase: 'failed', live: null, canExample: true, status: 'Clpr could not run in this tab. The recorded run is still available; retry with Start Clpr live mode.' })
  expect(console.info).toHaveBeenCalledWith('Clpr live mode is off:', 'Error: Clpr returned HTTP 500; see its JSON response in the psql pane.')
})

test('the example control starts live mode with its words, then searches in the running mode', async () => {
  const d = desk()
  d.modes.example('   ')
  expect(d.clpr).toHaveLength(0)
  d.modes.example('  clutch fight ')
  expect(d.view).toMatchObject({ mode: 'clpr', phase: 'starting', canExample: false })
  // A second submission while starting is ignored.
  d.modes.example('another')
  expect(d.clpr).toHaveLength(1)
  d.clpr[0].emit(ready)
  expect(d.clpr[0].sent).toEqual([{ ev: 'search', id: 1, words: 'clutch fight', rows: undefined }])
  d.clpr[0].emit(result(1))
  await settled()
  expect(d.view.canExample).toBe(true)

  d.modes.example('absent')
  expect(d.clpr).toHaveLength(1)
  expect(d.clpr[0].sent.at(-1)).toEqual({ ev: 'search', id: 2, words: 'absent', rows: undefined })
  expect(d.view.canExample).toBe(false)
  // The shell's own search does not release the example control.
  const shell = d.modes.search('shell')
  d.clpr[0].emit(result(3))
  await shell
  expect(d.view.canExample).toBe(false)
  d.clpr[0].emit(result(2, '{"error":"fixture"}', 500))
  await settled()
  expect(d.view).toMatchObject({ phase: 'live', canExample: true })
})

test('starting the SQL benchmark during a Clpr search stops Clpr and ignores its replies', async () => {
  const d = desk()
  await liveClpr(d)
  const search = d.modes.search('world record')
  d.modes.startBenchmark()
  await expect(search).rejects.toThrow('Clpr live mode stopped.')
  expect(d.clpr[0].terminated).toBe(true)
  expect(d.view).toMatchObject({
    mode: 'benchmark', phase: 'starting', live: null, sub: 'recorded run', stopLabel: 'Stop SQL benchmark', canStart: true, canExample: true, canStop: true,
    status: 'Running the SQL benchmark on generated clips. This mode runs SQL directly; recorded times remain until completion.',
  })
  const running = d.view
  d.clpr[0].emit(result(2))
  d.clpr[0].emit({ ev: 'progress', message: 'stale Clpr progress' })
  d.clpr[0].emit({ ev: 'error', message: 'stale Clpr failure' })
  expect(d.view).toBe(running)
  // The shell now reaches the SQL benchmark.
  await expect(d.modes.search('world record')).rejects.toThrow('PostgreSQL is still starting. Try the search again when the psql pane says live.')
  finishSql(d.pg[0])
  expect(d.view).toMatchObject({ mode: 'benchmark', phase: 'live', status: 'SQL benchmark complete on 50,008 generated clips. Direct SQL, measured in this tab; ready for a shell search.' })
})

test('starting Clpr during a SQL search stops the benchmark and ignores its replies', async () => {
  const d = desk()
  d.modes.startBenchmark()
  finishSql(d.pg[0])
  const search = d.modes.search('world record')
  d.modes.startLive()
  await expect(search).rejects.toThrow('The SQL benchmark stopped.')
  expect(d.pg[0].terminated).toBe(true)
  expect(d.view).toMatchObject({
    mode: 'clpr', phase: 'starting', sub: 'recorded run', stopLabel: 'Stop live mode', canStop: true,
    status: 'Downloading the pinned Clpr build and starting PostgreSQL.',
  })
  expect(d.view.bench.cap).toBe("Recorded on Clpr's demo, 14 Nov 2026")
  const starting = d.view, heard = d.log.length
  finishSql(d.pg[0])
  d.pg[0].emit({ ev: 'result', id: 1, query: "'world':* & 'record':*", run: idx, rows: [match], total: 1 })
  d.pg[0].emit({ ev: 'error', message: 'stale SQL failure after switching' })
  vi.advanceTimersByTime(2000)
  expect(d.view).toBe(starting)
  expect(d.log).toHaveLength(heard)
  expect(d.pg[0].sent).toEqual([{ ev: 'search', id: 1, words: 'world record' }])
  d.clpr[0].emit(ready)
  d.clpr[0].emit(result(1))
  expect(d.view).toMatchObject({ mode: 'clpr', phase: 'live', status: 'Clpr search complete: 2 matches. Clpr is live: all 155 migrations applied, 8 fixture clips and 0 generated clips. Go handler request measured in this tab.' })
})

test('restarting a mode replaces its worker', () => {
  const d = desk()
  d.modes.startBenchmark()
  d.modes.startBenchmark()
  expect(d.pg.map(worker => worker.terminated)).toEqual([true, false])
  finishSql(d.pg[0])
  expect(d.view.phase).toBe('starting')
  finishSql(d.pg[1])
  expect(d.view.phase).toBe('live')
})

test('closing the desk frees the worker and rejects what was pending', async () => {
  const sql = desk()
  sql.modes.startBenchmark()
  finishSql(sql.pg[0])
  const search = sql.modes.search('world record')
  sql.modes.close()
  await expect(search).rejects.toThrow('The desk was closed.')
  expect(sql.pg[0].terminated).toBe(true)
  vi.advanceTimersByTime(5000)
  expect(sql.pg[0].sent).toEqual([{ ev: 'search', id: 1, words: 'world record' }])

  const live = desk()
  await liveClpr(live)
  const pending = live.modes.search('world record')
  live.modes.close()
  await expect(pending).rejects.toThrow('Clpr live mode stopped.')
  expect(live.clpr[0].terminated).toBe(true)
})
