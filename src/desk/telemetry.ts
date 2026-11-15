import type { Ink } from '../ink/engine'
import type { PgEvent } from './pg-protocol'

/** Worker timestamps are translated to the page clock, matching marks in the Performance panel. */
export function startTelemetry(ink: Ink | null): (event: PgEvent) => void {
  const logPane = document.querySelector<HTMLElement>('section.log')!
  const processPane = document.querySelector<HTMLElement>('section.process')!
  logPane.querySelector('.ptitle > span')!.textContent = 'since navigation'
  processPane.querySelector('.ptitle > span')!.textContent = 'live, every second'
  const log = document.createElement('ol'); log.className = 'boot-log'; log.setAttribute('aria-label', 'Startup events')
  logPane.querySelector('.pbody')!.replaceChildren(log)
  const stats = document.createElement('dl'); stats.className = 'process-stats'
  const fields = new Map<string, HTMLElement>()
  for (const label of ['Frame rate', 'Frame time', 'CPU submit', 'GPU path', 'Renderer', 'PostgreSQL', 'Clip rows', 'Database size', 'SQL statements']) {
    const dt = document.createElement('dt'), dd = document.createElement('dd')
    dt.textContent = label; dd.textContent = 'waiting'; fields.set(label, dd); stats.append(dt, dd)
  }
  processPane.querySelector('.pbody')!.replaceChildren(stats)
  const set = (key: string, value: string) => { fields.get(key)!.textContent = value }
  const seen = new Set<string>()
  function record(step: string, text: string, at = performance.now()) {
    if (seen.has(step)) return
    seen.add(step)
    const elapsed = Math.max(0, at)
    performance.mark(`desk:${step}`, { startTime: elapsed })
    const item = document.createElement('li'), time = document.createElement('span')
    item.dataset.step = step; item.dataset.ms = String(elapsed)
    time.textContent = `+${Math.round(elapsed).toLocaleString('en-US')} ms `
    item.append(time, text); log.append(item)
  }
  record('page', 'Desk module started')
  document.fonts.load('900 100px "Big Shoulders Display Variable"')
    .then(() => document.fonts.ready).then(() => record('fonts', 'Fonts ready'))
    .catch(() => record('fonts', 'Font loading failed; fallback type in use'))
  let path = ''
  const paint = () => {
    const info = ink?.info()
    const gpu = info?.renderer ? info.path : 'static fallback'
    if (gpu !== path) {
      path = gpu
      // The backend reports its actual path, including a later device-loss fallback.
      record(`gpu-${log.querySelectorAll('[data-step^="gpu-"]').length}`, `GPU path: ${gpu}`)
    }
    set('GPU path', gpu)
    set('Renderer', info?.renderer || 'unavailable')
    const drawing = info?.running && !document.hidden
    set('Frame rate', drawing ? `${info.fps.toFixed(1)} fps` : 'still frame')
    set('Frame time', drawing ? `${(1000 / info.fps).toFixed(2)} ms` : 'not drawing')
    // CPU wall time to submit one step and draw; it is not a GPU completion measurement.
    set('CPU submit', drawing ? `${info.stepMs.toFixed(2)} ms` : 'not drawing')
  }
  if (ink) void ink.ready.then(paint)
  else paint()
  const timer = setInterval(paint, 1000)
  addEventListener('pagehide', event => { if (!event.persisted) clearInterval(timer) }, { once: true })
  return (event) => {
    const at = event.at === undefined ? performance.now() : event.at - performance.timeOrigin
    switch (event.ev) {
      case 'worker': record('worker', 'Worker module started', at); break
      case 'ready': set('PostgreSQL', event.version); record('postgres', `PostgreSQL ${event.version} ready (${Math.round(event.ms)} ms)`, at); break
      case 'schema': record('schema', `Schema created (${Math.round(event.ms)} ms)`, at); break
      case 'seed': set('Clip rows', event.rows.toLocaleString('en-US')); record('seed', `Seeded ${event.rows.toLocaleString('en-US')} generated clips (${Math.round(event.ms)} ms)`, at); break
      case 'index': record('index', `GIN index built and analyzed (${Math.round(event.ms)} ms)`, at); break
      case 'bench': record(`benchmark-${event.kind}`, `${event.kind === 'seq' ? 'No-index' : 'Indexed'} benchmark complete`, at); break
      case 'stats': set('Database size', `${(event.bytes / 1024 / 1024).toFixed(2)} MiB`); set('SQL statements', event.queries.toLocaleString('en-US')); break
      case 'error': record('postgres-error', 'PostgreSQL unavailable; psql shows a recorded run', at); set('PostgreSQL', 'unavailable'); break
    }
  }
}
