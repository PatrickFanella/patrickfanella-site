// Demo page behaviour. The recorded run is already in the HTML; this adds tabs, case switching and
// live mode. All HTML comes from render.mjs, which escapes every value. Throwaway prototype code.
import { inspector } from './render.mjs'

const rec = window.RECORDED
const ctx = { plans: rec.plans, probe: rec.probe }
const $ = (s) => document.querySelector(s)
let view = { c: rec.cases[0], mode: 'recorded' }
let tab = 'response'
let worker = null, seq = 0, latest = 0, busy = false, confirmed = false
const waiters = new Map()

function render(focusTab = false) {
  $('#inspector').innerHTML = inspector(view.c, view.mode, ctx, tab)
  if (focusTab) document.querySelector(`[data-tab="${tab}"]`)?.focus()
}
function selectCase(id, { push = true } = {}) {
  document.querySelectorAll('[data-case]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.case === id)))
  $('#case-select').value = id
  const c = rec.cases.find((x) => x.id === id)
  if (!c) return
  syncQueryBar(c.url)
  if (push) history.replaceState(null, '', '#' + id)
  if (worker && !busy) return send(c.url, c)
  view = { c, mode: 'recorded' }; render()
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; render(true); return }
  const b = e.target.closest('[data-case]'); if (b) selectCase(b.dataset.case)
})
$('#case-select').addEventListener('change', (e) => selectCase(e.target.value))
document.addEventListener('keydown', (e) => {
  const t = e.target.closest('[role="tab"]'); if (!t) return
  const ids = [...document.querySelectorAll('[role="tab"]')].map((x) => x.dataset.tab)
  const i = ids.indexOf(tab)
  const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ids.length - 1 }[e.key]
  if (next === undefined) return
  e.preventDefault(); tab = ids[(next + ids.length) % ids.length]; render(true)
})

// Keep the query bar showing the request that is on screen.
function syncQueryBar(url) {
  const q = new URL(url, location.href).searchParams, f = $('#query-bar')
  f.q.value = q.get('q') || ''; f.limit.value = q.get('limit') || '20'
  for (const k of ['type', 'sort']) if (q.get(k)) f[k].value = q.get(k)
}
function editable(on) { $('#query-bar').hidden = !on; $('#recorded-note').hidden = on }
const tableSize = (rows) => { const t = $('#mode-table'); t.hidden = false; t.textContent = `Table: ${rows.toLocaleString('en-US')} rows. Change it in the query bar.` }

// One orchestrated moment: after a live request, light the path in order. Skipped under reduced motion.
function pulse(result) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const nodes = [...document.querySelectorAll('#inspector svg.path .node.on')]
  nodes.forEach((n, i) => { n.style.setProperty('--d', `${i * 90}ms`); n.classList.remove('pulse'); void n.getBBox(); n.classList.add('pulse') })
}

// Live mode
const state = (s) => { $('#mode-state').textContent = s }
const lowResource = () => navigator.connection?.saveData || (navigator.deviceMemory && navigator.deviceMemory < 4) || matchMedia('(max-width: 760px)').matches
function ask(msg) { return new Promise((resolve, reject) => { const id = ++seq; waiters.set(id, { resolve, reject }); worker.postMessage({ ...msg, id }) }) }

function startLive() {
  if (lowResource() && !confirmed) {
    confirmed = true
    state('This device may be short on memory or data. Live mode needs about 500 MB and a 14.5 MB download. Press again to run it anyway.')
    $('#go-live').textContent = 'Run it anyway'; return
  }
  $('#go-live').hidden = true; $('#progress').hidden = false; $('#mode-cost').hidden = true
  state('Downloading and starting live mode (1 of 4).')
  worker = new Worker('live-worker.mjs', { type: 'module' })
  const steps = ['PostgreSQL', 'Migrations', 'Synthetic rows', 'Go']
  worker.onerror = (e) => fail(e.message || 'the worker could not load')
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') state(`Starting live mode: ${data.name} (${steps.indexOf(data.name) + 1} of 4).`)
    if (data.type === 'ready') {
      $('#progress').hidden = true
      const p = data.phases
      state(`Live in your browser. PostgreSQL ${ms(p.PostgreSQL)}, ${data.migrations} migrations ${ms(p.Migrations)}, Go ${ms(p.Go)}.`)
      $('#stop-live').hidden = false; editable(true); $('#live-led')?.classList.add('on')
      tableSize(data.rows)
      send(view.c.url, view.c)
    }
    if (data.type === 'error' && !data.id) fail(data.message)
    const w = data.id && waiters.get(data.id)
    if (w) { waiters.delete(data.id); data.type === 'error' ? w.reject(new Error(data.message)) : w.resolve(data) }
  }
  worker.postMessage({ type: 'boot', synthetic: 0 })
}
const ms = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + ' s' : v + ' ms')

async function send(url, meta) {
  const mine = ++latest
  busy = true; $('#progress').hidden = false
  try {
    const { result } = await ask({ type: 'request', url })
    if (mine !== latest) return // a newer request replaced this one
    view = { c: { ...result, id: meta.id, label: meta.label, simulated: meta.simulated, source: 'live' }, mode: 'live' }
    render(); pulse(result)
    state(`Live in your browser. Last request: ${result.status} in ${result.ms} ms.`); tableSize(result.rows)
  } catch (e) { state(`That request failed in the worker: ${e.message}. Live mode is still running.`) }
  finally { if (mine === latest) { busy = false; $('#progress').hidden = true } }
}

function fail(message) {
  worker?.terminate(); worker = null
  $('#progress').hidden = true; $('#stop-live').hidden = true; editable(false); $('#mode-table').hidden = true
  const go = $('#go-live'); go.hidden = false; go.textContent = 'Try again'
  state(`Live mode failed: ${message}. The recorded run is shown instead.`)
  view = { c: rec.cases.find((c) => c.id === view.c.id) || rec.cases[0], mode: 'recorded' }; render()
}
function stopLive() {
  worker?.terminate(); worker = null; waiters.clear(); latest++
  $('#stop-live').hidden = true; editable(false); $('#progress').hidden = true; $('#live-led')?.classList.remove('on'); $('#mode-cost').hidden = false; $('#mode-table').hidden = true
  const go = $('#go-live'); go.hidden = false; go.textContent = 'Run it live'
  state('Live mode stopped. Showing the recorded run.')
  view = { c: rec.cases.find((c) => c.id === view.c.id) || rec.cases[0], mode: 'recorded' }; render()
}

$('#go-live').addEventListener('click', startLive)
$('#stop-live').addEventListener('click', stopLive)
$('#query-bar').addEventListener('submit', (e) => {
  e.preventDefault()
  const f = new FormData(e.target); const q = new URLSearchParams()
  for (const k of ['q', 'type', 'sort', 'limit']) if (f.get(k)) q.set(k, f.get(k))
  document.querySelectorAll('[data-case]').forEach((b) => b.setAttribute('aria-pressed', 'false'))
  send('/api/v1/search?' + q.toString(), { id: 'custom', label: 'Your request' })
})
$('#query-bar').addEventListener('change', async (e) => {
  if (e.target.name !== 'dataset') return
  const radios = [...document.querySelectorAll('[name="dataset"]')]
  radios.forEach((r) => { r.disabled = true }); $('#progress').hidden = false
  state('Changing the table size. The table is rewritten, so this takes a few seconds.')
  try {
    const d = await ask({ type: 'dataset', synthetic: Number(e.target.value) })
    state(`The table now has ${d.rows.toLocaleString('en-US')} rows (${ms(d.ms)}).`)
    send(view.c.url, view.c)
  } catch (err) { state(`Could not change the table: ${err.message}.`) }
  finally { radios.forEach((r) => { r.disabled = false }); $('#progress').hidden = true }
})

$('#go-live').hidden = false
editable(false); syncQueryBar(view.c.url)
const hash = location.hash.slice(1)
if (hash === 'live') { $('#live').scrollIntoView(); $('#go-live').focus() }
else if (rec.cases.some((c) => c.id === hash)) selectCase(hash, { push: false })
addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h === 'live') { $('#live').scrollIntoView(); $('#go-live').focus() } else if (rec.cases.some((c) => c.id === h)) selectCase(h, { push: false }) })
