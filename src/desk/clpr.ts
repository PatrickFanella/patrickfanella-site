import { manifest, type ClprEvent } from './clpr-protocol'
import type { SearchResult } from './psql'
import { startInspector } from './inspector/inspector'

/** Opt-in Clpr mode shares the psql output with the SQL benchmark, but owns its worker. */
export function startClpr(pane: HTMLElement, options: {
  pre: HTMLElement; bench: HTMLElement; sub: HTMLElement
  stopBenchmark(): void; startBenchmark(): void; recorded(): void
}) {
  const inspector = startInspector(pane.querySelector<HTMLElement>('[data-inspector]')!, rows => search(lastWords, rows))
  const controls = document.createElement('div'); controls.className = 'clpr-controls'
  const meta = document.createElement('p'); meta.dataset.clprMeta = ''
  const source = document.createElement('a')
  source.href = `https://github.com/subculture-collective/clpr/tree/${manifest.commit}`
  source.textContent = `Clpr ${manifest.commit.slice(0, 7)}`
  meta.append(source, `; source ${manifest.date.slice(0, 10)}; ${(manifest.wasm.gzipBytes / 1e6).toFixed(2)} MB gzip; ${manifest.goVersion}`)
  const provenance = document.createElement('p'); provenance.dataset.clprProvenance = ''
  if (manifest.builtInClprCI && manifest.ciRun) {
    const ci = document.createElement('a'); ci.href = manifest.ciRun; ci.textContent = 'Built in Clpr CI'
    provenance.append(ci)
  } else provenance.textContent = 'Built outside Clpr CI.'
  provenance.append(' PostgreSQL and its extensions download with live mode. Searches stay in this tab; this demo uses Clpr’s PostgreSQL path and eight fixture clips. The Plan tab can add generated clips.')
  const buttons = document.createElement('div'); buttons.className = 'clpr-buttons'
  const start = document.createElement('button'); start.type = 'button'; start.textContent = 'Start Clpr live mode'
  const stop = document.createElement('button'); stop.type = 'button'; stop.textContent = 'Stop live mode'; stop.disabled = true
  const benchmark = document.createElement('button'); benchmark.type = 'button'; benchmark.textContent = 'Run SQL benchmark'
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.dataset.clprStatus = ''
  status.textContent = 'Recorded evidence below. Start live mode to run Clpr’s Go search handler here.'
  buttons.append(start, stop, benchmark); controls.append(meta, provenance, buttons, status)
  pane.querySelector('.pbody')!.prepend(controls)

  let state: 'idle' | 'starting' | 'live' | 'failed' = 'idle'
  const set = (value: typeof state) => { state = value; pane.dataset.clpr = value }
  set('idle')
  let worker: Worker | null = null, requestId = 0, shownId = 0
  let lastWords = 'world record'
  let slow: ReturnType<typeof setTimeout> | undefined
  const pending = new Map<number, { resolve: (value: SearchResult) => void; reject: (error: Error) => void }>()
  const terminate = () => {
    inspector.clear(); options.pre.hidden = false
    clearTimeout(slow); worker?.terminate(); worker = null
    for (const request of pending.values()) request.reject(new Error('Clpr live mode stopped.'))
    pending.clear()
    start.disabled = false; stop.disabled = true
  }
  const reset = () => {
    set('idle'); terminate(); options.recorded()
    status.textContent = 'Live mode stopped. The psql pane shows the recorded run.'
  }
  const fail = (message: string) => {
    set('failed'); terminate(); options.recorded()
    status.textContent = 'Clpr could not run in this tab. The recorded run is still available; retry with Start Clpr live mode.'
    console.info('Clpr live mode is off:', message)
  }
  const search = (words: string, rows?: number): Promise<SearchResult> => {
    if (!words.trim()) return Promise.reject(new Error('Use search followed by words or numbers.'))
    if (state !== 'live' || !worker) return Promise.reject(new Error(state === 'starting'
      ? 'Clpr is still starting. Try again when live mode is ready.'
      : 'Start Clpr live mode to run the Go search handler.'))
    const id = ++requestId
    lastWords = words
    shownId = id
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      worker!.postMessage({ id, words, rows })
    })
  }
  const onEvent = (event: ClprEvent) => {
    if (event.ev === 'error') { fail(event.message); return }
    if (event.ev === 'progress') { status.textContent = event.message; return }
    if (event.ev === 'ready') {
      clearTimeout(slow); set('live')
      status.textContent = `Clpr is live: all ${event.migrations} migrations applied, ${event.rows} fixture clips, PostgreSQL ${event.version}. Type search world record in the shell.`
      options.sub.textContent = `Clpr ${manifest.commit.slice(0, 7)}, live in this tab`
      // Show the same fixture request as the spike. Stopping during it is an ordinary cancellation.
      void search('world record').catch(error => { if (state === 'live') fail(String(error)) })
      return
    }
    const request = pending.get(event.id)
    if (!request) return
    pending.delete(event.id)
    try {
      if (event.id === shownId) {
        status.textContent = `Clpr is live: all ${manifest.migrationCount} migrations applied, 8 fixture clips and ${(event.rows - 8).toLocaleString('en-US')} generated clips. Type search world record in the shell.`
        inspector.render(event)
        options.bench.hidden = true
        options.pre.hidden = true
      }
      const body: unknown = JSON.parse(event.response.body)
      if (event.response.status !== 200) throw new Error(`Clpr returned HTTP ${event.response.status}; see its JSON response in the psql pane.`)
      if (typeof body !== 'object' || body === null || !('counts' in body) || !('results' in body)) throw new Error('Clpr returned an unexpected response')
      const { counts, results } = body
      if (typeof counts !== 'object' || counts === null || !('clips' in counts) || typeof counts.clips !== 'number'
        || typeof results !== 'object' || results === null || !('clips' in results) || !Array.isArray(results.clips)) throw new Error('Clpr returned unexpected clip results')
      const first: unknown = results.clips[0]
      const top = typeof first === 'object' && first !== null && 'title' in first && typeof first.title === 'string' ? first.title : undefined
      request.resolve({ total: counts.clips, top, time: event.ms.toFixed(1), timing: 'Clpr request time' })
    } catch (error) { request.reject(error instanceof Error ? error : new Error(String(error))) }
  }
  start.addEventListener('click', () => {
    options.stopBenchmark(); options.recorded(); set('starting')
    start.disabled = true; stop.disabled = false
    status.textContent = 'Downloading the pinned Clpr build and starting PostgreSQL.'
    slow = setTimeout(() => { status.textContent = 'Clpr is still loading. The recorded run remains below; Stop live mode cancels the download.' }, 30_000)
    try {
      worker = new Worker(new URL('./clpr.worker.ts', import.meta.url), { type: 'module', name: 'clpr-search' })
      worker.onmessage = (event: MessageEvent<ClprEvent>) => onEvent(event.data)
      worker.onerror = event => { event.preventDefault(); fail(event.message || 'The worker did not load') }
    } catch (error) { fail(String(error)) }
  })
  stop.addEventListener('click', reset)
  benchmark.addEventListener('click', () => { reset(); status.textContent = 'Running the SQL benchmark on generated clips. This mode runs SQL directly.'; options.startBenchmark() })
  addEventListener('pagehide', event => { if (!event.persisted) terminate() })
  return { get active() { return state !== 'idle' }, search }
}
