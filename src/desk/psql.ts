// The psql pane: Clpr's search query, its plan and rows, and the timing panel beside them.
// It opens on Clpr's recorded run, starts PostgreSQL in a module worker, and swaps in the times
// measured in this tab once both medians are in. If the worker cannot start, the recorded run stays.
import { QUERY, SEARCH_SQL, type PgEvent, type Row, type Run } from './pg-protocol'
import { RECORDED_ON, recordedIdx, recordedSeq } from './recorded'

const fmt = (n: number) => n.toLocaleString('en-US')
const ms = (n: number) => n.toFixed(2)
const scanName = (r: Run) => /Seq Scan/.test(r.plan.join('\n')) ? 'seq scan' : /Index Scan/.test(r.plan.join('\n')) ? 'index scan' : 'scan'

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

/** EXPLAIN's node lines, filter counts and the two timing lines, with costs, buffers and loops left
 *  out and the six-space indent per level tightened to two, so the plan fits the pane. */
export function tidyPlan(plan: string[]): string[] {
  const out: string[] = []
  for (const raw of plan) {
    const lead = raw.length - raw.trimStart().length
    const text = raw.trim().replace(/\s*\(cost=[^)]*\)/, '').replace(/ loops=1\)/, ')').replace(/rows=(\d+)\.00/g, 'rows=$1').replace(/\s{2,}/g, ' ')
    // A node at depth d starts its arrow at 2 + 6(d - 1); its detail lines start at 2 + 6d.
    const d = Math.max(0, Math.round((lead - 2) / 6))
    if (text.startsWith('->')) out.push(` ${'  '.repeat(d + 1)}-> ${text.slice(2).trim()}`)
    else if (lead === 0 && !/^Planning:?$/.test(text)) out.push(` ${text}`)
    else if (/^Rows Removed by Filter/.test(text)) out.push(` ${d ? `${'  '.repeat(d + 1)}   ` : '  '}${text}`)
  }
  return out
}

interface Shown { run: Run; rows: Row[]; total: number; of: number }

function renderSession(pre: HTMLElement, s: Shown, status: string) {
  pre.replaceChildren()
  const sql = `EXPLAIN (ANALYZE, COSTS OFF, BUFFERS OFF)\n${SEARCH_SQL};  -- $1 = ${QUERY}`.split('\n')
  sql.forEach((l, i) => line(pre, ...(i === 0 ? [['ps1', 'clpr=#'] as Part, ' '] : []), ...mark(l, SQL_RE, ['s', 'c', 'k', 'n'])))
  line(pre)
  for (const l of tidyPlan(s.run.plan)) {
    if (l.startsWith(' Execution Time')) line(pre, ' Execution Time: ', ['hl', l.slice(' Execution Time: '.length)])
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

export function startPsql(pane: HTMLElement) {
  const body = pane.querySelector<HTMLElement>('.pbody')!
  const sub = pane.querySelector<HTMLElement>('[data-pg-sub]')!
  const pre = document.createElement('pre')
  pre.className = 'psql-out'; pre.tabIndex = 0; pre.setAttribute('aria-label', "psql session running Clpr's search query")
  const bench = document.createElement('div')
  bench.className = 'bench'; bench.setAttribute('role', 'group'); bench.setAttribute('aria-label', 'The same search with and without the GIN index')
  bench.innerHTML = BENCH
  body.classList.add('psql-body'); body.replaceChildren(pre, bench)
  const q = <T extends HTMLElement>(s: string) => bench.querySelector<T>(s)!
  const bars = bench.querySelectorAll<HTMLElement>('.bbar i')

  const figures = (seq: number, idx: number) => {
    q('[data-pg-seq]').textContent = ms(seq); q('[data-pg-idx]').textContent = ms(idx)
    const top = Math.max(seq, idx)
    bars[0].style.width = `${Math.max(1.5, seq / top * 100)}%`; bars[1].style.width = `${Math.max(1.5, idx / top * 100)}%`
  }
  const recordedStatus = `recorded run from Clpr's demo, ${RECORDED_ON}`
  const showRecorded = (note: string, status: string) => {
    q('[data-pg-cap]').textContent = `Recorded on Clpr's demo, ${RECORDED_ON}`
    q('[data-pg-seq-note]').textContent = `seq scan, ${fmt(recordedSeq.rows)} rows`
    q('[data-pg-idx-note]').textContent = `index scan, ${fmt(recordedIdx.rows)} rows`
    figures(recordedSeq.run.exec, recordedIdx.run.exec)
    q('[data-pg-note]').textContent = note
    renderSession(pre, { run: recordedIdx.run, rows: recordedIdx.found, total: recordedIdx.total, of: recordedIdx.rows }, status)
  }

  let state: 'starting' | 'live' | 'failed' = 'starting'
  const set = (s: typeof state) => { state = s; pane.dataset.pg = s }
  set('starting')
  sub.textContent = 'recorded run'
  showRecorded("PostgreSQL is starting in this tab. Until it answers, these are Clpr's recorded times.", `${recordedStatus}. Starting PostgreSQL in this tab.`)

  let worker: Worker | null = null
  const fail = (why: string) => {
    if (state !== 'starting') return
    set('failed'); worker?.terminate()
    console.info('PostgreSQL is off:', why)
    sub.textContent = 'recorded run'
    showRecorded("PostgreSQL could not start in this tab, so these are Clpr's recorded times.", `${recordedStatus}. PostgreSQL could not start in this tab.`)
  }
  // Progress goes on the last line of the recorded session until the measured run replaces it.
  const progress = (text: string) => {
    if (state !== 'starting') return
    pre.lastChild?.remove(); pre.lastChild?.remove()
    line(pre, ['c', `-- ${recordedStatus}. ${text}`])
  }

  let version = '', rows = 0, seq: Run | null = null
  const onEvent = (m: PgEvent) => {
    if (state !== 'starting') return
    switch (m.ev) {
      case 'ready': version = m.version; progress(`PostgreSQL ${version} is up in ${fmt(Math.round(m.ms))} ms; inserting clips.`); break
      case 'seed': rows = m.rows; progress(`Inserted ${fmt(rows)} generated clips in ${fmt(Math.round(m.ms))} ms; timing the query.`); break
      case 'index': progress(`Built the GIN index in ${fmt(Math.round(m.ms))} ms; timing the query again.`); break
      case 'bench':
        if (m.kind === 'seq') { seq = m.run; progress(`Without the index: ${ms(m.run.exec)} ms. Building the GIN index.`); break }
        if (!seq) break
        set('live')
        sub.textContent = `live in this tab, PostgreSQL ${version}`
        q('[data-pg-cap]').textContent = 'Measured in this tab, median of 3 runs'
        q('[data-pg-seq-note]').textContent = `${scanName(seq)}, ${fmt(rows)} rows`
        q('[data-pg-idx-note]').textContent = `${scanName(m.run)}, ${fmt(rows)} rows`
        figures(seq.exec, m.run.exec)
        {
          const x = seq.exec / m.run.exec
          const faster = x >= 1 ? `The index answers ${x >= 10 ? Math.round(x) : x.toFixed(1)} times faster` : `The index answers ${(1 / x).toFixed(1)} times slower`
          q('[data-pg-note]').textContent = `${faster} on the same ${fmt(rows)} rows. Clpr's recorded demo: ${ms(recordedSeq.run.exec)} ms without the index at ${fmt(recordedSeq.rows)} rows, ${ms(recordedIdx.run.exec)} ms with it at ${fmt(recordedIdx.rows)}.`
        }
        // The worker stays up with its database, for the searches the shell will send it.
        renderSession(pre, { run: m.run, rows: m.rows, total: m.total, of: rows }, `measured in this tab by PostgreSQL ${version}`)
        break
      case 'error': fail(m.message); break
    }
  }

  try {
    // A real module file from this origin, not a blob URL, so a `worker-src 'self'` policy allows it.
    worker = new Worker(new URL('./pg.worker.ts', import.meta.url), { type: 'module', name: 'postgres' })
    worker.onmessage = (e: MessageEvent<PgEvent>) => onEvent(e.data)
    worker.onerror = (e) => { e.preventDefault(); fail(e.message || 'the worker script did not load') }
  } catch (err) { fail((err as Error).message) }
}
