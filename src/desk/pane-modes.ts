// Which of its three modes the psql pane is in, and everything that follows from it: the recorded
// run, the SQL benchmark or Clpr live mode; what the mode's worker is doing; the status copy; what
// the pane shows; and which worker replies still count. No DOM: the pane passes in its two worker
// factories and a render function, so pane-modes.test.ts drives it with fixture workers.
//
// One worker runs at a time. Leaving a mode terminates its worker and rejects its pending searches;
// a callback from a worker that is no longer the current one changes nothing.
import { QUERY, searchTerms, type PgEvent, type PgRequest, type Row, type Run } from './pg-protocol'
import type { ClprEvent, ClprRequest } from './clpr-protocol'
import { RECORDED_ON, recordedIdx, recordedSeq } from './recorded'
import { compare, measured, scanName, tick } from './benchmark'

export interface SearchResult { total: number; time: string; top?: string; timing?: string }
export type ClprResult = Extract<ClprEvent, { ev: 'result' }>

/** A worker as the modes use it. `Worker` fits; a test passes a fixture. */
export interface ModeWorker<Request, Event> {
  postMessage(message: Request): void
  terminate(): void
  onmessage: ((event: MessageEvent<Event>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

/** A measured run also carries the clock's step, so its times are shown at the clock's resolution. */
export interface Shown { run: Run; rows: Row[]; total: number; of: number; step?: number }
/** The psql text: a query, its plan and rows, and the comment on its last line. A change of status
 *  alone keeps the same `shown`. */
export interface Session { shown: Shown; query: string; status: string }
/** The timing panel. `bars` are the two times the bars are scaled by; `batches` are the batch means
 *  of a measured comparison. */
export interface Bench {
  cap: string; seqNote: string; idxNote: string; seq: string; idx: string
  bars: [seq: number, idx: number]; batches?: [seq: string, idx: string]; seqHidden: boolean; note: string
}

export interface View {
  mode: 'recorded' | 'benchmark' | 'clpr'
  /** What the mode's worker is doing. 'slow' is the SQL benchmark still starting after 30 s. */
  phase: 'idle' | 'starting' | 'slow' | 'live' | 'failed'
  status: string
  sub: string
  stopLabel: string
  canStart: boolean; canExample: boolean; canStop: boolean
  session: Session
  bench: Bench
  /** The Clpr response the inspector shows, or null for its recorded run. */
  live: ClprResult | null
}

const fmt = (n: number) => n.toLocaleString('en-US')
const ms = (n: number) => n.toFixed(2)
const plural = (n: number) => n === 1 ? 'match' : 'matches'
const recordedStatus = `recorded run from Clpr's demo, ${RECORDED_ON}`
const CHOOSE = 'Choose Clpr live mode to run the Go handler, or the SQL benchmark to compare index timings.'

export function startModes({ gate, build, pgWorker, clprWorker, render, onPgEvent = () => {} }: {
  /** Whether the recorded run authorizes Clpr live mode, and why not. */
  gate: { allowed: boolean; reason: string }
  /** The pinned Clpr build. */
  build: { commit: string; migrationCount: number }
  /** Nothing is requested until the visitor starts a mode. */
  pgWorker(): ModeWorker<PgRequest, PgEvent>
  clprWorker(): ModeWorker<ClprRequest, ClprEvent>
  /** Called with the whole view after every change. */
  render(view: View): void
  /** Every event of the current SQL worker, for the startup log. */
  onPgEvent?(event: PgEvent): void
}) {
  const idleStatus = gate.allowed ? 'Recorded evidence below. Start live mode to run Clpr’s Go search handler here.' : gate.reason
  let mode: View['mode'] = 'recorded', phase: View['phase'] = 'idle'
  let status = idleStatus, sub = 'recorded run', exampleBusy = false
  let session!: Session, bench!: Bench, live: ClprResult | null = null
  let pg: ModeWorker<PgRequest, PgEvent> | null = null, clpr: ModeWorker<ClprRequest, ClprEvent> | null = null
  const pending = new Map<number, { resolve(result: SearchResult): void; reject(error: Error): void }>()
  // Both downloads take minutes on a slow link, and no deadline can tell that from a hung fetch, so
  // past 30 s the pane only says it is still loading. A later answer still replaces the recorded run.
  let slow: ReturnType<typeof setTimeout> | undefined
  let pgId = 0, clprId = 0, shownId = 0
  let lastWords = 'world record', startupWords = 'world record'
  let version = '', rows = 0, step = 1, seq: Run | null = null

  const paint = () => render({
    mode, phase, status, sub, session, bench, live,
    stopLabel: mode === 'benchmark' ? 'Stop SQL benchmark' : 'Stop live mode',
    canStart: gate.allowed && !(mode === 'clpr' && (phase === 'starting' || phase === 'live')),
    canExample: gate.allowed && !exampleBusy,
    canStop: phase !== 'idle' && phase !== 'failed',
  })
  const showRecorded = (note: string, comment: string) => {
    bench = {
      cap: `Recorded on Clpr's demo, ${RECORDED_ON}`, seqHidden: false, note,
      seqNote: `seq scan, ${fmt(recordedSeq.rows)} rows`, idxNote: `index scan, ${fmt(recordedIdx.rows)} rows`,
      seq: ms(recordedSeq.run.exec), idx: ms(recordedIdx.run.exec), bars: [recordedSeq.run.exec, recordedIdx.run.exec],
    }
    session = { shown: { run: recordedIdx.run, rows: recordedIdx.found, total: recordedIdx.total, of: recordedIdx.rows }, query: QUERY, status: comment }
  }
  const settle = (message: string) => {
    for (const request of pending.values()) request.reject(new Error(message))
    pending.clear()
  }
  /** Back to the recorded run. The mode's worker is terminated, so whatever it sends later is stale. */
  const leave = () => {
    clearTimeout(slow); pg?.terminate(); clpr?.terminate(); pg = clpr = null
    settle(mode === 'benchmark' ? 'The SQL benchmark stopped.' : 'Clpr live mode stopped.')
    mode = 'recorded'; phase = 'idle'; live = null; exampleBusy = false; sub = 'recorded run'
    showRecorded(CHOOSE, recordedStatus)
  }

  // The SQL benchmark. Progress goes on the last line of the recorded session until the measured run replaces it.
  const progress = (text: string) => {
    session = { ...session, status: `${recordedStatus}. ${text}` }
    status = `SQL benchmark: ${text} The output still shows recorded evidence until completion.`
  }
  const markSlow = () => {
    if (phase !== 'starting') return
    phase = 'slow'
    bench = { ...bench, note: "PostgreSQL is still loading in this tab. Until it answers, these are Clpr's recorded times." }
    progress('PostgreSQL is still loading in this tab.')
    paint()
  }
  const pgFail = (why: string) => {
    clearTimeout(slow); phase = 'failed'; pg?.terminate(); pg = null
    settle('PostgreSQL is unavailable in this tab.')
    onPgEvent({ ev: 'error', message: why })
    console.info('PostgreSQL is off:', why)
    sub = 'recorded run'
    showRecorded("PostgreSQL could not start in this tab, so these are Clpr's recorded times.", `${recordedStatus}. PostgreSQL could not start in this tab.`)
    status = 'SQL benchmark failed. These are recorded times; use Run SQL benchmark to retry.'
  }
  const onPg = (m: PgEvent) => {
    onPgEvent(m)
    if (m.ev === 'search' || m.ev === 'search-error') {
      const request = pending.get(m.id)
      if (!request) return
      pending.delete(m.id)
      if (m.ev === 'search-error') {
        status = 'SQL search failed. The last output remains; try another search.'
        request.reject(new Error(m.message)); return
      }
      const time = measured(m.run.exec, step, m.run.runs).text
      session = { shown: { run: m.run, rows: m.rows, total: m.total, of: rows, step }, query: m.query, status: `measured in this tab by PostgreSQL ${version}; prefix terms joined with AND` }
      // The initial comparison belongs to world record, not this search, so its row is hidden.
      bench = {
        ...bench, cap: 'Your search, measured in this tab', seqHidden: true, idx: time, idxNote: `${scanName(m.run.plan)}, ${fmt(rows)} rows`,
        note: `Prefix search with AND; ${fmt(m.total)} matches. Mean of ${fmt(m.run.runs ?? 1)} query runs, at this tab's clock resolution.`,
      }
      status = `SQL search complete: ${fmt(m.total)} ${plural(m.total)} in ${fmt(rows)} generated clips. Direct SQL, measured in this tab.`
      request.resolve({ total: m.total, time, top: m.rows[0]?.title })
      return
    }
    if (m.ev === 'error') { pgFail(m.message); return }
    if (phase !== 'starting' && phase !== 'slow') return
    switch (m.ev) {
      case 'ready': clearTimeout(slow); version = m.version; step = m.step; progress(`PostgreSQL ${version} is up in ${fmt(Math.round(m.ms))} ms; inserting clips.`); break
      case 'seed': rows = m.rows; progress(`Inserted ${fmt(rows)} generated clips in ${fmt(Math.round(m.ms))} ms; timing the query.`); break
      case 'index': progress(`Built the GIN index in ${fmt(Math.round(m.ms))} ms; timing the query again.`); break
      case 'bench': {
        if (m.kind === 'seq') { seq = m.run; progress(`Without the index: ${measured(m.run.exec, step, m.run.runs).text} ms. Building the GIN index.`); break }
        if (!seq) break
        phase = 'live'
        sub = `live in this tab, PostgreSQL ${version}`
        const shown = compare(seq, m.run, step, rows)
        bench = {
          cap: 'Measured in this tab, median of 3 batches', seqHidden: false,
          seqNote: `${scanName(seq.plan)}, ${fmt(rows)} rows`, idxNote: `${scanName(m.run.plan)}, ${fmt(rows)} rows`,
          seq: shown.seq, idx: shown.idx, bars: [seq.exec, m.run.exec],
          // Each figure is the middle of three batch means; keep all three, so a test can check the median.
          batches: [(seq.batches ?? []).join(' '), (m.run.batches ?? []).join(' ')],
          note: `${shown.ratio} This tab's clock ticks every ${tick(step)} ms, so each batch repeats the query for 50 ms and takes the mean. Clpr's recorded demo: ${ms(recordedSeq.run.exec)} ms without the index at ${fmt(recordedSeq.rows)} rows, ${ms(recordedIdx.run.exec)} ms with it at ${fmt(recordedIdx.rows)}.`,
        }
        session = { shown: { run: m.run, rows: m.rows, total: m.total, of: rows, step }, query: QUERY, status: `measured in this tab by PostgreSQL ${version}: the plan of the median batch's last run, on a clock that ticks every ${tick(step)} ms` }
        status = `SQL benchmark complete on ${fmt(rows)} generated clips. Direct SQL, measured in this tab; ready for a shell search.`
      }
    }
  }
  const pgSearch = (words: string): Promise<SearchResult> => {
    if (mode !== 'benchmark') return Promise.reject(new Error('Start Clpr live mode or the SQL benchmark in the psql pane first.'))
    if (!searchTerms(words)) return Promise.reject(new Error('Use search followed by words or numbers.'))
    const worker = pg
    if (phase !== 'live' || !worker) return Promise.reject(new Error(phase === 'failed'
      ? 'PostgreSQL is unavailable in this tab; the psql pane shows a recorded run.'
      : 'PostgreSQL is still starting. Try the search again when the psql pane says live.'))
    const id = ++pgId
    status = 'Running a direct SQL search on generated clips in this tab.'
    paint()
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      worker.postMessage({ ev: 'search', id, words })
    })
  }

  // Clpr live mode.
  const clprFail = (message: string) => {
    leave(); mode = 'clpr'; phase = 'failed'
    status = 'Clpr could not run in this tab. The recorded run is still available; retry with Start Clpr live mode.'
    console.info('Clpr live mode is off:', message)
  }
  const clprSearch = (words: string, size?: number): Promise<SearchResult> => {
    if (!words.trim()) return Promise.reject(new Error('Use search followed by words or numbers.'))
    const worker = clpr
    if (phase !== 'live' || !worker) return Promise.reject(new Error(mode === 'clpr' && phase === 'starting'
      ? 'Clpr is still starting. Try again when live mode is ready.'
      : 'Start Clpr live mode to run the Go search handler.'))
    const id = ++clprId
    lastWords = words
    shownId = id
    status = 'Running Clpr’s Go search handler on fixture clips and any generated clips in this tab.'
    paint()
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      worker.postMessage({ id, words, rows: size })
    })
  }
  /** The example control waits for its own search, whatever the shell is doing. */
  const exampleSearch = (words: string, failed: (error: unknown) => void = () => { /* The search status reports the failure. */ }) => {
    exampleBusy = true
    void clprSearch(words).catch(failed).finally(() => { exampleBusy = false; paint() })
  }
  const onClpr = (event: ClprEvent) => {
    if (event.ev === 'error') { clprFail(event.message); return }
    if (event.ev === 'progress') { status = event.message; return }
    if (event.ev === 'ready') {
      clearTimeout(slow); phase = 'live'
      status = `Clpr is live: all ${event.migrations} migrations applied, ${event.rows} fixture clips, PostgreSQL ${event.version}. Type search world record in the shell.`
      sub = `Clpr ${build.commit.slice(0, 7)}, live in this tab`
      // Show the fixture request at once. Stopping during it is an ordinary cancellation; any other failure ends live mode.
      exampleSearch(startupWords, error => { if (mode === 'clpr' && phase === 'live') clprFail(String(error)) })
      return
    }
    const request = pending.get(event.id)
    if (!request) return
    pending.delete(event.id)
    // Only the latest search is shown; an earlier one still answers whoever asked.
    const shown = event.id === shownId
    try {
      // The inspector renders here, so a response it cannot render fails this search.
      if (shown) { live = event; paint() }
      const body: unknown = JSON.parse(event.response.body)
      if (event.response.status !== 200) throw new Error(`Clpr returned HTTP ${event.response.status}; see its JSON response in the psql pane.`)
      if (typeof body !== 'object' || body === null || !('counts' in body) || !('results' in body)) throw new Error('Clpr returned an unexpected response')
      const { counts, results } = body
      if (typeof counts !== 'object' || counts === null || !('clips' in counts) || typeof counts.clips !== 'number'
        || typeof results !== 'object' || results === null || !('clips' in results) || !Array.isArray(results.clips)) throw new Error('Clpr returned unexpected clip results')
      const first: unknown = results.clips[0]
      const top = typeof first === 'object' && first !== null && 'title' in first && typeof first.title === 'string' ? first.title : undefined
      if (shown) status = `Clpr search complete: ${counts.clips} ${plural(counts.clips)}. Clpr is live: all ${build.migrationCount} migrations applied, 8 fixture clips and ${fmt(event.rows - 8)} generated clips. Go handler request measured in this tab.`
      request.resolve({ total: counts.clips, top, time: event.ms.toFixed(1), timing: 'Clpr request time' })
    } catch (error) {
      if (shown) status = 'Clpr search failed; inspect its response or try another search.'
      request.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /** Only the current worker's callbacks are heard: a reply from a terminated one changes nothing. */
  const listen = <Request, Event>(worker: ModeWorker<Request, Event>, onEvent: (event: Event) => void, fail: (message: string) => void, unloaded: string) => {
    const current = (): boolean => worker === pg || worker === clpr
    worker.onmessage = event => { if (current()) { onEvent(event.data); paint() } }
    worker.onerror = event => { event.preventDefault(); if (current()) { fail(event.message || unloaded); paint() } }
    return worker
  }
  const stats = setInterval(() => { if (phase === 'live') pg?.postMessage({ ev: 'stats' }) }, 1000)
  showRecorded(CHOOSE, recordedStatus)
  paint()

  const modes = {
    startBenchmark() {
      leave(); mode = 'benchmark'; phase = 'starting'
      showRecorded("PostgreSQL is starting in this tab. Until it answers, these are Clpr's recorded times.", `${recordedStatus}. Starting PostgreSQL in this tab.`)
      status = 'Running the SQL benchmark on generated clips. This mode runs SQL directly; recorded times remain until completion.'
      slow = setTimeout(markSlow, 30_000)
      try { pg = listen(pgWorker(), onPg, pgFail, 'the worker script did not load') } catch (error) { pgFail(String(error)) }
      paint()
    },
    /** Start Clpr live mode and show a first search for `words`. The gate holds whatever the control says. */
    startLive(words = 'world record') {
      startupWords = words
      if (!gate.allowed) { status = idleStatus; paint(); return }
      leave(); mode = 'clpr'; phase = 'starting'; exampleBusy = true
      status = 'Downloading the pinned Clpr build and starting PostgreSQL.'
      slow = setTimeout(() => { status = 'Clpr is still loading. The recorded run remains below; Stop live mode cancels the download.'; paint() }, 30_000)
      try { clpr = listen(clprWorker(), onClpr, clprFail, 'The worker did not load') } catch (error) { clprFail(String(error)) }
      paint()
    },
    /** The example control: start live mode with these words, or search them when it is already live. */
    example(input: string) {
      const words = input.trim()
      if (!words || (mode === 'clpr' && phase === 'starting')) return
      if (mode === 'clpr' && phase === 'live') exampleSearch(words)
      else modes.startLive(words)
    },
    stop() {
      const benchmark = mode === 'benchmark'
      leave()
      status = `${benchmark ? 'SQL benchmark' : 'Live mode'} stopped. The psql pane shows the recorded run.`
      paint()
    },
    /** A shell search goes to whichever mode is running. */
    search: (words: string) => mode === 'clpr' ? clprSearch(words) : pgSearch(words),
    /** Run the last Clpr search again on this many clips. */
    resize: (size: number) => clprSearch(lastWords, size),
    /** The page is going away: free the worker without touching the view. */
    close() {
      clearTimeout(slow); clearInterval(stats); pg?.terminate(); clpr?.terminate(); pg = clpr = null
      settle(mode === 'benchmark' ? 'The desk was closed.' : 'Clpr live mode stopped.')
    },
  }
  return modes
}
