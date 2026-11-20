// The psql pane: Clpr's search query, its plan and rows, the timing panel beside them and the search
// inspector. It opens on Clpr's recorded run. The visitor can start the SQL benchmark or Clpr's Go
// handler in a module worker. pane-modes.ts decides what the pane is doing and says; this file only
// builds the elements, creates the workers and writes each view to the page.
import { SEARCH_SQL, type PgEvent } from './pg-protocol'
import { manifest } from './clpr-protocol'
import { clprControls } from './clpr'
import { tidyPlan } from './benchmark'
import { startInspector } from './inspector/inspector'
import { startModes, type ClprResult, type SearchResult, type Session, type View } from './pane-modes'

const fmt = (n: number) => n.toLocaleString('en-US')

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

function renderSession(pre: HTMLElement, { shown: s, query, status }: Session) {
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

export interface Psql { search(words: string): Promise<SearchResult> }

export function startPsql(pane: HTMLElement, onProgress: (event: PgEvent) => void = () => {}): Psql {
  const body = pane.querySelector<HTMLElement>('.pbody')!
  const root = pane.querySelector<HTMLElement>('[data-inspector]')!
  const sub = pane.querySelector<HTMLElement>('[data-pg-sub]')!
  const pre = document.createElement('pre')
  // A named, focusable region, so keyboard users can scroll it; aria-label is not allowed on a bare pre.
  pre.className = 'psql-out'; pre.tabIndex = 0; pre.setAttribute('role', 'region'); pre.setAttribute('aria-label', "psql session running Clpr's search query")
  const bench = document.createElement('div')
  bench.className = 'bench'; bench.setAttribute('role', 'group'); bench.setAttribute('aria-label', 'The same search with and without the GIN index')
  bench.innerHTML = BENCH
  const ui = clprControls(root.dataset.liveLabel!)
  body.classList.add('psql-body'); body.replaceChildren(ui.controls, pre, bench, root)
  const inspector = startInspector(root, rows => modes.resize(rows))
  const q = <T extends HTMLElement>(s: string) => bench.querySelector<T>(s)!
  const bars = bench.querySelectorAll<HTMLElement>('.bbar i')
  // Two of these are live regions, so text is written only when it changes.
  const text = (element: HTMLElement, value: string) => { if (element.textContent !== value) element.textContent = value }
  // A focused button that disables itself would drop keyboard focus to the body, so the status line,
  // which says what happened, takes it first.
  const enable = (button: HTMLButtonElement, on: boolean) => {
    if (!on && document.activeElement === button) ui.status.focus()
    button.disabled = !on
  }

  let session: Session | undefined, live: ClprResult | null = null
  const render = (view: View) => {
    pane.dataset.pg = view.mode === 'benchmark' ? view.phase : 'idle'
    pane.dataset.clpr = view.mode === 'clpr' ? view.phase : 'idle'
    // The one place that shows or hides the three: the SQL benchmark has the psql text and the timing
    // panel; the recorded run and Clpr live mode have the inspector.
    const sql = view.mode === 'benchmark'
    pre.hidden = !sql; bench.hidden = !sql; root.hidden = sql

    text(sub, view.sub); text(ui.status, view.status); text(ui.stop, view.stopLabel)
    enable(ui.start, view.canStart); enable(ui.sample, view.canExample); enable(ui.stop, view.canStop)

    const b = view.bench
    text(q('[data-pg-cap]'), b.cap); text(q('[data-pg-note]'), b.note); q('.seq').hidden = b.seqHidden
    text(q('[data-pg-seq-note]'), b.seqNote); text(q('[data-pg-idx-note]'), b.idxNote)
    text(q('[data-pg-seq]'), b.seq); text(q('[data-pg-idx]'), b.idx)
    if (b.batches) { q('[data-pg-seq]').dataset.batches = b.batches[0]; q('[data-pg-idx]').dataset.batches = b.batches[1] }
    const top = Math.max(...b.bars)
    b.bars.forEach((time, i) => { bars[i].style.width = `${Math.max(1.5, time / top * 100)}%` })

    if (view.session !== session) {
      if (view.session.shown !== session?.shown) renderSession(pre, view.session)
      // Progress replaces only the last line of the session.
      else { pre.lastChild?.remove(); pre.lastChild?.remove(); line(pre, ['c', `-- ${view.session.status}`]) }
      session = view.session
    }
    if (view.live !== live) {
      live = view.live
      if (live) inspector.render(live)
      else inspector.clear()
    }
  }

  // No worker, Wasm or database data is requested until the visitor starts a mode.
  const modes = startModes({
    gate: { allowed: root.dataset.liveAllowed === 'true', reason: root.dataset.liveReason! },
    build: manifest,
    pgWorker: () => new Worker(new URL('./pg.worker.ts', import.meta.url), { type: 'module', name: 'postgres' }),
    clprWorker: () => new Worker(new URL('./clpr.worker.ts', import.meta.url), { type: 'module', name: 'clpr-search' }),
    render,
    onPgEvent: onProgress,
  })
  ui.start.addEventListener('click', () => modes.startLive())
  ui.example.addEventListener('submit', event => { event.preventDefault(); modes.example(ui.input.value) })
  ui.stop.addEventListener('click', () => modes.stop())
  ui.benchmark.addEventListener('click', () => modes.startBenchmark())
  // Leaving the page frees the worker, except when the page enters the back-forward cache.
  addEventListener('pagehide', event => { if (!event.persisted) modes.close() })
  return { search: modes.search }
}
