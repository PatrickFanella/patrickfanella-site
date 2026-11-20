import { manifest, type ClprEvent } from './clpr-protocol'
import type { SearchResult, BenchmarkStatus } from './psql'
import { startInspector } from './inspector/inspector'
import { fixtureCount } from './inspector/recording.mjs'

/** Opt-in Clpr mode shares the psql output with the SQL benchmark, but owns its worker. */
export function startClpr(pane: HTMLElement, options: {
  pre: HTMLElement; bench: HTMLElement; sub: HTMLElement
  stopBenchmark(): void; startBenchmark(report: (status: BenchmarkStatus) => void): void; recorded(): void
}) {
  const root = pane.querySelector<HTMLElement>('[data-inspector]')!
  const allowed = root.dataset.liveAllowed === 'true'
  const inspector = startInspector(root, rows => search(lastWords, rows))
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
  const example = document.createElement('form'); example.className = 'clpr-example'
  const label = document.createElement('label'); label.htmlFor = 'clpr-example'; label.textContent = 'Example search'
  const input = document.createElement('input'); input.id = 'clpr-example'; input.name = 'query'; input.value = 'world record'; input.required = true
  const sample = document.createElement('button'); sample.type = 'submit'; sample.dataset.clprExample = ''
  sample.textContent = `Run example live (${root.dataset.liveLabel!.split('(')[1]}`; sample.disabled = !allowed
  example.append(label, input, sample)
  const buttons = document.createElement('div'); buttons.className = 'clpr-buttons'
  const start = document.createElement('button'); start.type = 'button'; start.textContent = root.dataset.liveLabel!; start.disabled = !allowed
  const stop = document.createElement('button'); stop.type = 'button'; stop.textContent = 'Stop live mode'; stop.disabled = true
  const benchmark = document.createElement('button'); benchmark.type = 'button'; benchmark.textContent = 'Run SQL benchmark'
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.dataset.clprStatus = ''
  const idleStatus = allowed ? 'Recorded evidence below. Start live mode to run Clpr’s Go search handler here.' : root.dataset.liveReason!
  status.textContent = idleStatus
  buttons.append(start, stop, benchmark); controls.append(example, meta, provenance, buttons, status)
  pane.querySelector('.pbody')!.prepend(controls)

  let mode: 'recorded' | 'clpr' | 'benchmark' = 'recorded'
  let state: 'idle' | 'starting' | 'live' | 'failed' = 'idle'
  const set = (value: typeof state) => { state = value; pane.dataset.clpr = value }
  set('idle')
  let worker: Worker | null = null, requestId = 0, shownId = 0
  let lastWords = 'world record', startupWords = 'world record'
  let slow: ReturnType<typeof setTimeout> | undefined
  const pending = new Map<number, { resolve: (value: SearchResult) => void; reject: (error: Error) => void }>()
  const terminate = () => {
    inspector.clear(); options.pre.hidden = false
    clearTimeout(slow); worker?.terminate(); worker = null
    for (const request of pending.values()) request.reject(new Error('Clpr live mode stopped.'))
    pending.clear()
    start.disabled = !allowed; sample.disabled = !allowed; stop.disabled = true
  }
  const reset = () => {
    const benchmark = mode === 'benchmark'
    mode = 'recorded'; options.stopBenchmark()
    set('idle'); terminate(); options.recorded()
    stop.textContent = 'Stop live mode'
    status.textContent = benchmark ? 'SQL benchmark stopped. The psql pane shows the recorded run.' : 'Live mode stopped. The psql pane shows the recorded run.'
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
    status.textContent = 'Running Clpr’s Go search handler on fixture clips and any generated clips in this tab.'
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
      void search(startupWords).catch(error => { if (state === 'live') fail(String(error)) }).finally(() => { sample.disabled = !allowed })
      return
    }
    const request = pending.get(event.id)
    if (!request) return
    pending.delete(event.id)
    try {
      if (event.id === shownId) {
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
      if (event.id === shownId) status.textContent = `Clpr search complete: ${counts.clips} ${counts.clips === 1 ? 'match' : 'matches'}. Clpr is live: all ${manifest.migrationCount} migrations applied, ${fixtureCount} fixture clips and ${(event.rows - fixtureCount).toLocaleString('en-US')} generated clips. Go handler request measured in this tab.`
      request.resolve({ total: counts.clips, top, time: event.ms.toFixed(1), timing: 'Clpr request time' })
    } catch (error) {
      if (event.id === shownId) status.textContent = 'Clpr search failed; inspect its response or try another search.'
      request.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }
  const startLive = (words: string) => {
    startupWords = words
    // Enforce the gate as well as disabling the control.
    if (!allowed) { status.textContent = idleStatus; return }
    mode = 'clpr'; options.stopBenchmark(); options.recorded(); set('starting')
    start.disabled = true; sample.disabled = true; stop.disabled = false; stop.textContent = 'Stop live mode'
    status.textContent = 'Downloading the pinned Clpr build and starting PostgreSQL.'
    slow = setTimeout(() => { status.textContent = 'Clpr is still loading. The recorded run remains below; Stop live mode cancels the download.' }, 30_000)
    try {
      const current = new Worker(new URL('./clpr.worker.ts', import.meta.url), { type: 'module', name: 'clpr-search' })
      worker = current
      current.onmessage = (event: MessageEvent<ClprEvent>) => { if (worker === current) onEvent(event.data) }
      current.onerror = event => { event.preventDefault(); if (worker === current) fail(event.message || 'The worker did not load') }
    } catch (error) { fail(String(error)) }
  }
  start.addEventListener('click', () => startLive('world record'))
  example.addEventListener('submit', event => {
    event.preventDefault()
    const words = input.value.trim()
    if (!words || state === 'starting') return
    if (state !== 'live') { startLive(words); return }
    sample.disabled = true
    void search(words).catch(() => { /* The existing search status reports the failure. */ })
      .finally(() => { sample.disabled = !allowed })
  })
  stop.addEventListener('click', reset)
  benchmark.addEventListener('click', () => {
    reset(); mode = 'benchmark'; stop.textContent = 'Stop SQL benchmark'
    options.startBenchmark(event => {
      if (mode !== 'benchmark') return
      status.textContent = event.message
      stop.disabled = event.state === 'idle' || event.state === 'failed'
    })
  })
  addEventListener('pagehide', event => { if (!event.persisted) terminate() })
  return { get active() { return state !== 'idle' }, search }
}
