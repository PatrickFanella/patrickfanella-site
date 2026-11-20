// The psql pane: Clpr's search query, its plan and rows, and the timing panel beside them.
// It opens on Clpr's recorded run. The visitor can start the SQL benchmark or Clpr's Go handler
// in a module worker. If a worker cannot start, the recorded run stays.
import { QUERY, SEARCH_SQL, searchTerms, type PgEvent, type Row, type Run } from './pg-protocol'
import { RECORDED_ON, recordedIdx, recordedSeq } from './recorded'
import { startClpr } from './clpr'
import { compare, measured, scanName, tick, tidyPlan } from './benchmark'

const fmt = (n: number) => n.toLocaleString('en-US')
const ms = (n: number) => n.toFixed(2)

type Part = string | [cls: string, text: string]

/** Append one line to the pre, with the parts that carry a class wrapped in spans. */
function line(pre: HTMLElement, ...parts: Part[]) {
  for (const p of parts) {
    if (typeof p === 'string') { pre.append(p); continue }
    const s = document.createElement('span'); s.className = p[0]; s.textContent = p[1]; pre.append(s)
  }
  pre.append('\n')
}

/** Split text on a pattern whose capture groups name classes, in order. */
function mark(text: string, re: RegExp, classes: string[]): Part[] {
  const out: Part[] = []
  let at = 0
  for (const m of text.matchAll(re)) {
    if (m.index > at) out.push(text.slice(at, m.index))
    const g = m.slice(1).findIndex((x) => x !== undefined)
    out.push([classes[g], m[0]])
    at = m.index + m[0].length
  }
  if (at < text.length) out.push(text.slice(at))
  return out
}

const SQL_RE = /('[^']*')|(--.*$)|\b(EXPLAIN|ANALYZE|COSTS|BUFFERS|OFF|SELECT|FROM|WHERE|AND|ORDER BY|DESC|LIMIT)\b|(\$1|\b\d+\b|\bfalse\b)/g
const PLAN_RE = /(idx_clips_search_vector)|(Seq Scan)|(\d+(?:\.\d+)?(?:\.\.\d+(?:\.\d+)?)?)/g

/** A measured run also carries the clock's step, so its times are shown at the clock's resolution. */
interface Shown { run: Run; rows: Row[]; total: number; of: number; step?: number }

function renderSession(pre: HTMLElement, s: Shown, status: string, query = QUERY) {
  pre.replaceChildren()
  const sql = `EXPLAIN (ANALYZE, COSTS OFF, BUFFERS OFF)\n${SEARCH_SQL};  -- $1 = ${query}`.split('\n')
  sql.forEach((l, i) => line(pre, ...(i === 0 ? [['ps1', 'clpr=#'] as Part, ' '] : []), ...mark(l, SQL_RE, ['s', 'c', 'k', 'n'])))
  line(pre)
  // The module words Execution Time, a measured one with its batch note; the pane only adds the spans.
  for (const l of tidyPlan(s.run, s.step)) {
    const exec = /^( Execution Time: )(.+? ms)(.*)$/.exec(l)
    if (exec) line(pre, exec[1], ['hl', exec[2]], ...(exec[3] ? [['c', exec[3]] as Part] : []))
    else line(pre, ...mark(l, PLAN_RE, ['g', 'w', 'n']))
  }
  line(pre)
  line(pre, ['c', ` ${'title'.padEnd(33)} ${'creator'.padEnd(12)} votes`])
  for (const r of s.rows) line(pre, ` ${r.title.padEnd(33)} ${r.creator.padEnd(12)} `, ['n', String(r.votes).padStart(5)])
  line(pre, '(', ['hl', `${fmt(s.total)} ${s.total === 1 ? 'row' : 'rows'}`], ' of ', ['hl', fmt(s.of)], ' generated clips)')
  line(pre, ['c', `-- ${status}`])
}

const BENCH = `<p class="bcap" data-pg-cap></p>
<div class="brow seq"><p class="blabel"><b>No index</b> <span data-pg-seq-note></span></p><p class="bnum"><span data-pg-seq></span><small>ms</small></p><div class="bbar" aria-hidden="true"><i></i></div></div>
<div class="brow idx"><p class="blabel"><b>GIN index</b> <span data-pg-idx-note></span></p><p class="bnum"><span data-pg-idx></span><small>ms</small></p><div class="bbar" aria-hidden="true"><i></i></div></div>
<p class="bnote" data-pg-note role="status"></p>`

export interface SearchResult { total: number; time: string; top?: string; timing?: string }
export interface BenchmarkStatus { state: 'idle' | 'running' | 'ready' | 'failed'; message: string }
export interface Psql { search(words: string): Promise<SearchResult> }

export function startPsql(pane: HTMLElement, onProgress: (event: PgEvent) => void = () => {}): Psql {
  const body = pane.querySelector<HTMLElement>('.pbody')!
  const inspector = pane.querySelector<HTMLElement>('[data-inspector]')!
  const sub = pane.querySelector<HTMLElement>('[data-pg-sub]')!
  const pre = document.createElement('pre')
  // A named, focusable region, so keyboard users can scroll it; aria-label is not allowed on a bare pre.
  pre.className = 'psql-out'; pre.tabIndex = 0; pre.setAttribute('role', 'region'); pre.setAttribute('aria-label', "psql session running Clpr's search query")
  const bench = document.createElement('div')
  bench.className = 'bench'; bench.setAttribute('role', 'group'); bench.setAttribute('aria-label', 'The same search with and without the GIN index')
  bench.innerHTML = BENCH
  body.classList.add('psql-body'); body.replaceChildren(pre, bench, inspector)
  const q = <T extends HTMLElement>(s: string) => bench.querySelector<T>(s)!
  const bars = bench.querySelectorAll<HTMLElement>('.bbar i')

  const figures = (seq: number, idx: number, text = [ms(seq), ms(idx)]) => {
    q('[data-pg-seq]').textContent = text[0]; q('[data-pg-idx]').textContent = text[1]
    const top = Math.max(seq, idx)
    bars[0].style.width = `${Math.max(1.5, seq / top * 100)}%`; bars[1].style.width = `${Math.max(1.5, idx / top * 100)}%`
  }
  const recordedStatus = `recorded run from Clpr's demo, ${RECORDED_ON}`
  const showRecorded = (note: string, status: string) => {
    bench.hidden = false
    q<HTMLElement>('.seq').hidden = false
    q('[data-pg-cap]').textContent = `Recorded on Clpr's demo, ${RECORDED_ON}`
    q('[data-pg-seq-note]').textContent = `seq scan, ${fmt(recordedSeq.rows)} rows`
    q('[data-pg-idx-note]').textContent = `index scan, ${fmt(recordedIdx.rows)} rows`
    figures(recordedSeq.run.exec, recordedIdx.run.exec)
    q('[data-pg-note]').textContent = note
    renderSession(pre, { run: recordedIdx.run, rows: recordedIdx.found, total: recordedIdx.total, of: recordedIdx.rows }, status)
  }

  // 'slow' is still starting: PostgreSQL has not answered yet, and the pane says it is still loading.
  let state: 'idle' | 'starting' | 'slow' | 'live' | 'failed' = 'idle'
  const set = (s: typeof state) => { state = s; pane.dataset.pg = s }
  set('idle')
  sub.textContent = 'recorded run'
  const recorded = () => {
    sub.textContent = 'recorded run'
    showRecorded('Choose Clpr live mode to run the Go handler, or the SQL benchmark to compare index timings.', recordedStatus)
    pre.hidden = true; bench.hidden = true; inspector.hidden = false
  }
  recorded()

  let reportBenchmark: (status: BenchmarkStatus) => void = () => {}
  let worker: Worker | null = null
  const starting = () => state === 'starting' || state === 'slow'
  // PGlite fetches about 15 MB of WebAssembly and data before it answers, which takes minutes on a slow
  // link. No deadline can tell that from a hung fetch, so past one the pane only says it is still
  // loading, and a later answer still replaces the recorded run.
  let slow: ReturnType<typeof setTimeout> | undefined
  const markSlow = () => {
    if (state !== 'starting') return
    set('slow')
    q('[data-pg-note]').textContent = "PostgreSQL is still loading in this tab. Until it answers, these are Clpr's recorded times."
    progress('PostgreSQL is still loading in this tab.')
  }
  const fail = (why: string) => {
    if (state === 'failed') return
    clearTimeout(slow); set('failed'); worker?.terminate(); worker = null
    for (const request of pending.values()) request.reject(new Error('PostgreSQL is unavailable in this tab.'))
    pending.clear()
    onProgress({ ev: 'error', message: why })
    console.info('PostgreSQL is off:', why)
    sub.textContent = 'recorded run'
    showRecorded("PostgreSQL could not start in this tab, so these are Clpr's recorded times.", `${recordedStatus}. PostgreSQL could not start in this tab.`)
    reportBenchmark({ state: 'failed', message: 'SQL benchmark failed. These are recorded times; use Run SQL benchmark to retry.' })
  }
  // Progress goes on the last line of the recorded session until the measured run replaces it.
  const progress = (text: string) => {
    if (!starting()) return
    pre.lastChild?.remove(); pre.lastChild?.remove()
    line(pre, ['c', `-- ${recordedStatus}. ${text}`])
    reportBenchmark({ state: 'running', message: `SQL benchmark: ${text} The output still shows recorded evidence until completion.` })
  }

  let requestId = 0
  const pending = new Map<number, { resolve: (r: SearchResult) => void; reject: (e: Error) => void }>()
  let version = '', rows = 0, step = 1, seq: Run | null = null
  const onEvent = (m: PgEvent) => {
    onProgress(m)
    if (m.ev === 'search' || m.ev === 'search-error') {
      const request = pending.get(m.id)
      if (!request) return
      pending.delete(m.id)
      if (m.ev === 'search-error') {
        reportBenchmark({ state: 'ready', message: 'SQL search failed. The last output remains; try another search.' })
        request.reject(new Error(m.message)); return
      }
      const time = measured(m.run.exec, step, m.run.runs).text
      renderSession(pre, { run: m.run, rows: m.rows, total: m.total, of: rows, step },
        `measured in this tab by PostgreSQL ${version}; prefix terms joined with AND`, m.query)
      // The initial comparison belongs to world record, not this search.
      q('[data-pg-cap]').textContent = 'Your search, measured in this tab'
      q<HTMLElement>('.seq').hidden = true
      q('[data-pg-idx]').textContent = time
      q('[data-pg-idx-note]').textContent = `${scanName(m.run.plan)}, ${fmt(rows)} rows`
      q('[data-pg-note]').textContent = `Prefix search with AND; ${fmt(m.total)} matches. Mean of ${fmt(m.run.runs ?? 1)} query runs, at this tab's clock resolution.`
      reportBenchmark({ state: 'ready', message: `SQL search complete: ${fmt(m.total)} ${m.total === 1 ? 'match' : 'matches'} in ${fmt(rows)} generated clips. Direct SQL, measured in this tab.` })
      request.resolve({ total: m.total, time, top: m.rows[0]?.title })
      return
    }
    if (m.ev === 'error') { fail(m.message); return }
    if (!starting()) return
    switch (m.ev) {
      case 'ready': clearTimeout(slow); version = m.version; step = m.step; progress(`PostgreSQL ${version} is up in ${fmt(Math.round(m.ms))} ms; inserting clips.`); break
      case 'seed': rows = m.rows; progress(`Inserted ${fmt(rows)} generated clips in ${fmt(Math.round(m.ms))} ms; timing the query.`); break
      case 'index': progress(`Built the GIN index in ${fmt(Math.round(m.ms))} ms; timing the query again.`); break
      case 'bench':
        if (m.kind === 'seq') { seq = m.run; progress(`Without the index: ${measured(m.run.exec, step, m.run.runs).text} ms. Building the GIN index.`); break }
        if (!seq) break
        set('live')
        sub.textContent = `live in this tab, PostgreSQL ${version}`
        q('[data-pg-cap]').textContent = 'Measured in this tab, median of 3 batches'
        q('[data-pg-seq-note]').textContent = `${scanName(seq.plan)}, ${fmt(rows)} rows`
        q('[data-pg-idx-note]').textContent = `${scanName(m.run.plan)}, ${fmt(rows)} rows`
        {
          const shown = compare(seq, m.run, step, rows)
          figures(seq.exec, m.run.exec, [shown.seq, shown.idx])
          // Each figure is the middle of three batch means; keep all three, so a test can check the median.
          q('[data-pg-seq]').dataset.batches = (seq.batches ?? []).join(' '); q('[data-pg-idx]').dataset.batches = (m.run.batches ?? []).join(' ')
          q('[data-pg-note]').textContent = `${shown.ratio} This tab's clock ticks every ${tick(step)} ms, so each batch repeats the query for 50 ms and takes the mean. Clpr's recorded demo: ${ms(recordedSeq.run.exec)} ms without the index at ${fmt(recordedSeq.rows)} rows, ${ms(recordedIdx.run.exec)} ms with it at ${fmt(recordedIdx.rows)}.`
        }
        renderSession(pre, { run: m.run, rows: m.rows, total: m.total, of: rows, step }, `measured in this tab by PostgreSQL ${version}: the plan of the median batch's last run, on a clock that ticks every ${tick(step)} ms`)
        reportBenchmark({ state: 'ready', message: `SQL benchmark complete on ${fmt(rows)} generated clips. Direct SQL, measured in this tab; ready for a shell search.` })
        break
    }
  }

  const stopBenchmark = () => {
    clearTimeout(slow); worker?.terminate(); worker = null; set('idle')
    for (const request of pending.values()) request.reject(new Error('The SQL benchmark stopped.'))
    pending.clear()
    reportBenchmark({ state: 'idle', message: 'SQL benchmark stopped. Recorded evidence is available.' })
  }
  const startBenchmark = (report: (status: BenchmarkStatus) => void) => {
    stopBenchmark(); reportBenchmark = report; set('starting')
    inspector.hidden = true; pre.hidden = false
    showRecorded("PostgreSQL is starting in this tab. Until it answers, these are Clpr's recorded times.", `${recordedStatus}. Starting PostgreSQL in this tab.`)
    reportBenchmark({ state: 'running', message: 'Running the SQL benchmark on generated clips. This mode runs SQL directly; recorded times remain until completion.' })
    slow = setTimeout(markSlow, 30_000)
    try {
      // No worker, Wasm or database data is requested until the visitor starts this mode.
      const current = new Worker(new URL('./pg.worker.ts', import.meta.url), { type: 'module', name: 'postgres' })
      worker = current
      current.onmessage = (e: MessageEvent<PgEvent>) => { if (worker === current) onEvent(e.data) }
      current.onerror = (e) => { e.preventDefault(); if (worker === current) fail(e.message || 'the worker script did not load') }
    } catch (err) { fail(String(err)) }
  }
  const clpr = startClpr(pane, { pre, bench, sub, recorded, startBenchmark, stopBenchmark })
  const statsTimer = setInterval(() => { if (state === 'live') worker?.postMessage({ ev: 'stats' }) }, 1000)
  addEventListener('pagehide', (event) => {
    if (event.persisted) return
    clearTimeout(slow); clearInterval(statsTimer); worker?.terminate(); worker = null
    for (const request of pending.values()) request.reject(new Error('The desk was closed.'))
    pending.clear()
  }, { once: true })
  return {
    search(words) {
      if (clpr.active) return clpr.search(words)
      if (state === 'idle') return Promise.reject(new Error('Start Clpr live mode or the SQL benchmark in the psql pane first.'))
      if (!searchTerms(words)) return Promise.reject(new Error('Use search followed by words or numbers.'))
      if (state !== 'live' || !worker) return Promise.reject(new Error(state === 'failed'
        ? 'PostgreSQL is unavailable in this tab; the psql pane shows a recorded run.'
        : 'PostgreSQL is still starting. Try the search again when the psql pane says live.'))
      const id = ++requestId
      reportBenchmark({ state: 'running', message: 'Running a direct SQL search on generated clips in this tab.' })
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        worker!.postMessage({ ev: 'search', id, words })
      })
    },
  }
}
