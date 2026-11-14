// The psql pane: Clpr's search query, its plan and rows, and the timing panel beside them.
// It opens on Clpr's recorded run, starts PostgreSQL in a module worker, and swaps in the times
// measured in this tab once both medians are in. If the worker cannot start, the recorded run stays.
import { QUERY, SEARCH_SQL, type PgEvent, type Row, type Run } from './pg-protocol'
import { RECORDED_ON, recordedIdx, recordedSeq } from './recorded'

const fmt = (n: number) => n.toLocaleString('en-US')
const ms = (n: number) => n.toFixed(2)
/** A measured time with only the decimals the clock supports. Each reading is off by up to one tick,
 *  so a mean of n readings `step` apart is good to about step / 2√n at worst. Below that bound the
 *  figure is shown as "< bound", not as a number. */
export const measured = (exec: number, step: number, runs = 1) => {
  const bound = step / (2 * Math.sqrt(runs))
  const dp = Math.min(2, Math.max(0, Math.ceil(-Math.log10(bound))))
  // A ratio needs both times well clear of the bound: at five times it, a time is good to about 20%.
  return { text: exec < bound ? `< ${bound.toFixed(dp)}` : exec.toFixed(dp), below: exec < bound, rough: exec < 5 * bound }
}
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

/** A measured run also carries the clock's step, so its times are shown at the clock's resolution. */
interface Shown { run: Run; rows: Row[]; total: number; of: number; step?: number }

function renderSession(pre: HTMLElement, s: Shown, status: string) {
  pre.replaceChildren()
  const sql = `EXPLAIN (ANALYZE, COSTS OFF, BUFFERS OFF)\n${SEARCH_SQL};  -- $1 = ${QUERY}`.split('\n')
  sql.forEach((l, i) => line(pre, ...(i === 0 ? [['ps1', 'clpr=#'] as Part, ' '] : []), ...mark(l, SQL_RE, ['s', 'c', 'k', 'n'])))
  line(pre)
  for (let l of tidyPlan(s.run.plan)) {
    // A measured plan is the last run of the median batch, read on a coarse clock, so its node times
    // and Execution Time often read 0.000. Drop the node times, as TIMING OFF would, and show the
    // batch's mean in place of that one run's Execution Time, as the timing panel does.
    if (s.step) {
      l = l.replace(/actual time=[\d.]+\.\.[\d.]+ /, 'actual ')
      const plan = /^ Planning Time: ([\d.]+) ms$/.exec(l)
      if (plan) l = ` Planning Time: ${measured(parseFloat(plan[1]), s.step).text} ms`
    }
    if (!l.startsWith(' Execution Time')) { line(pre, ...mark(l, PLAN_RE, ['g', 'w', 'n'])); continue }
    if (!s.step) { line(pre, ' Execution Time: ', ['hl', l.slice(' Execution Time: '.length)]); continue }
    const n = s.run.runs ?? 1
    line(pre, ' Execution Time: ', ['hl', `${measured(s.run.exec, s.step, n).text} ms`], ['c', ` (mean of ${fmt(n)} ${n === 1 ? 'run' : 'runs'})`])
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
  // A named, focusable region, so keyboard users can scroll it; aria-label is not allowed on a bare pre.
  pre.className = 'psql-out'; pre.tabIndex = 0; pre.setAttribute('role', 'region'); pre.setAttribute('aria-label', "psql session running Clpr's search query")
  const bench = document.createElement('div')
  bench.className = 'bench'; bench.setAttribute('role', 'group'); bench.setAttribute('aria-label', 'The same search with and without the GIN index')
  bench.innerHTML = BENCH
  body.classList.add('psql-body'); body.replaceChildren(pre, bench)
  const q = <T extends HTMLElement>(s: string) => bench.querySelector<T>(s)!
  const bars = bench.querySelectorAll<HTMLElement>('.bbar i')

  const figures = (seq: number, idx: number, text = [ms(seq), ms(idx)]) => {
    q('[data-pg-seq]').textContent = text[0]; q('[data-pg-idx]').textContent = text[1]
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

  // 'slow' is still starting: PostgreSQL has not answered yet, and the pane says it is still loading.
  let state: 'starting' | 'slow' | 'live' | 'failed' = 'starting'
  const set = (s: typeof state) => { state = s; pane.dataset.pg = s }
  set('starting')
  sub.textContent = 'recorded run'
  showRecorded("PostgreSQL is starting in this tab. Until it answers, these are Clpr's recorded times.", `${recordedStatus}. Starting PostgreSQL in this tab.`)

  let worker: Worker | null = null
  const starting = () => state === 'starting' || state === 'slow'
  // PGlite fetches about 15 MB of WebAssembly and data before it answers, which takes minutes on a slow
  // link. No deadline can tell that from a hung fetch, so past one the pane only says it is still
  // loading, and a later answer still replaces the recorded run.
  const slow = setTimeout(() => {
    if (state !== 'starting') return
    set('slow')
    q('[data-pg-note]').textContent = "PostgreSQL is still loading in this tab. Until it answers, these are Clpr's recorded times."
    progress('PostgreSQL is still loading in this tab.')
  }, 30_000)
  const fail = (why: string) => {
    if (!starting()) return
    clearTimeout(slow); set('failed'); worker?.terminate()
    console.info('PostgreSQL is off:', why)
    sub.textContent = 'recorded run'
    showRecorded("PostgreSQL could not start in this tab, so these are Clpr's recorded times.", `${recordedStatus}. PostgreSQL could not start in this tab.`)
  }
  // Progress goes on the last line of the recorded session until the measured run replaces it.
  const progress = (text: string) => {
    if (!starting()) return
    pre.lastChild?.remove(); pre.lastChild?.remove()
    line(pre, ['c', `-- ${recordedStatus}. ${text}`])
  }

  let version = '', rows = 0, step = 1, seq: Run | null = null
  const tick = () => Number(step.toPrecision(1))
  const onEvent = (m: PgEvent) => {
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
        q('[data-pg-seq-note]').textContent = `${scanName(seq)}, ${fmt(rows)} rows`
        q('[data-pg-idx-note]').textContent = `${scanName(m.run)}, ${fmt(rows)} rows`
        {
          const a = measured(seq.exec, step, seq.runs), b = measured(m.run.exec, step, m.run.runs)
          figures(seq.exec, m.run.exec, [a.text, b.text])
          // Each figure is the middle of three batch means; keep all three, so a test can check the median.
          for (const [k, r] of [['seq', seq], ['idx', m.run]] as const) {
            const el = q(`[data-pg-${k}]`)
            el.dataset.batches = (r.batches ?? []).join(' '); el.dataset.runs = String(r.runs ?? 1)
          }
          bench.dataset.step = String(step)
          // Two significant figures at most: the ratio of two means is rougher than either.
          const x = seq.exec / m.run.exec, sig = (v: number) => String(Number(v.toPrecision(2)))
          const ratio = a.rough || b.rough ? 'One time is too close to what this tab\'s clock can resolve, so there is no ratio.'
            : `The index answers ${x >= 1 ? `about ${sig(x)} times faster` : `about ${sig(1 / x)} times slower`} on the same ${fmt(rows)} rows.`
          q('[data-pg-note]').textContent = `${ratio} This tab's clock ticks every ${tick()} ms, so each batch repeats the query for 50 ms and takes the mean. Clpr's recorded demo: ${ms(recordedSeq.run.exec)} ms without the index at ${fmt(recordedSeq.rows)} rows, ${ms(recordedIdx.run.exec)} ms with it at ${fmt(recordedIdx.rows)}.`
        }
        renderSession(pre, { run: m.run, rows: m.rows, total: m.total, of: rows, step }, `measured in this tab by PostgreSQL ${version}: the plan of the median batch's last run, on a clock that ticks every ${tick()} ms`)
        // Nothing sends it more queries yet, so free the WebAssembly instance and the 50,008 rows.
        worker?.terminate(); worker = null
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
