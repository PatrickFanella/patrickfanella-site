// Linux recorder: exercise the exact built visitor worker in headless Chromium, through the same
// worker client as the desk.
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { platform, arch, release } from 'node:os'
import config from '../astro.config.mjs'
import { parseRecording, sourceFingerprint, tableSizes } from '../src/desk/inspector/recording.mjs'

if (platform() !== 'linux') throw new Error('Memory recording needs Linux /proc; use CI on other platforms.')
const root = resolve('dist')
const manifest = JSON.parse(await readFile('public/clpr/manifest.json', 'utf8'))
const budget = JSON.parse(await readFile('src/desk/inspector/recording-policy.json', 'utf8'))
const workers = (await readdir(`${root}/_astro`)).filter(path => /^clpr\.worker-.*\.js$/.test(path))
if (workers.length !== 1) throw new Error('Build first: expected exactly one Clpr worker.')
const fingerprint = sourceFingerprint(createHash('sha256'), readFileSync)
const workerSha256 = createHash('sha256').update(await readFile(`${root}/_astro/${workers[0]}`)).digest('hex')
const built = JSON.parse(await readFile(`${root}/_astro/clpr-recording-build.json`, 'utf8'))
if (built.sourceFingerprint !== fingerprint || built.workerSha256 !== workerSha256 || built.worker !== workers[0]) throw new Error('Build first: the worker and source fingerprint do not match dist/.')
const downloads = new Map()
const CLIENT = '/worker-client.mjs'
const mime = { '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.gz': 'application/gzip' }
const server = createServer(async (req, res) => {
  try {
    res.setHeader('Content-Security-Policy', config.server.headers['Content-Security-Policy'])
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    if (path === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Clpr recording</title>'); return }
    // The harness's own script, not a visitor download, so it stays out of the recorded sizes.
    if (path === CLIENT) { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile('src/desk/worker-client.mjs')); return }
    const file = resolve(root, `.${path}`)
    if (!file.startsWith(root + '/')) { res.writeHead(403); res.end(); return }
    const data = await readFile(file)
    downloads.set(path, data.length)
    res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-store'); res.end(data)
  } catch { res.writeHead(404); res.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browserServer, browser, timer, sampling = Promise.resolve(), sampleError, peakBytes = 0, samples = 0
// Sum the browser and every descendant. Shared pages can be counted more than once;
// this is a conservative sampled process-tree RSS, not JS heap or unique allocation.
async function rss(pid) {
  try {
    const [status, children] = await Promise.all([
      readFile(`/proc/${pid}/status`, 'utf8'), readFile(`/proc/${pid}/task/${pid}/children`, 'utf8'),
    ])
    const own = Number(/^VmRSS:\s+(\d+)/m.exec(status)?.[1] ?? 0) * 1024
    const descendant = await Promise.all(children.trim().split(/\s+/).filter(Boolean).map(rss))
    return own + descendant.reduce((sum, bytes) => sum + bytes, 0)
  } catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') return 0; throw error }
}
try {
  browserServer = await chromium.launchServer({ headless: true })
  const pid = browserServer.process().pid
  const sample = async () => { const bytes = await rss(pid); peakBytes = Math.max(peakBytes, bytes); samples++ }
  await sample()
  let busy = false
  timer = setInterval(() => {
    if (busy) return
    busy = true
    sampling = sample().catch(error => { sampleError = error }).finally(() => { busy = false })
  }, 50)
  browser = await chromium.connect(browserServer.wsEndpoint())
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  const result = await page.evaluate(async ({ workerPath, clientPath, sizes }) => {
    const { connect } = await import(clientPath)
    const started = performance.now(), results = []
    let ready, startupMs, up, down
    const startup = new Promise((resolve, reject) => { up = resolve; down = reject })
    // Any failure ends the recording: closing the client rejects the request in flight.
    const stop = message => { down(new Error(message)); client.close(message) }
    const client = connect(new Worker(workerPath, { type: 'module' }), {
      event: data => { if (data.ev === 'ready') { ready = data; startupMs = performance.now() - started; client.started(); up() } },
      result: data => data,
      failed: stop,
      slow: () => stop('Worker startup timed out'), slowAfter: 180_000,
    })
    try {
      await startup
      for (const rows of sizes) {
        const timeout = setTimeout(() => stop('Search recording timed out'), 180_000)
        const result = await client.request({ ev: 'search', words: 'world record', rows }).finally(() => clearTimeout(timeout))
        if (result.response.status !== 200 || result.rows !== rows || !result.plan) throw new Error(result.planError ?? 'Invalid recorded response')
        results.push(result)
      }
      return { results, ready, startupMs }
    } finally { client.close('The recording ended.') }
  }, { workerPath: `/_astro/${workers[0]}`, clientPath: CLIENT, sizes: tableSizes })
  clearInterval(timer); await sampling; await sample()
  if (sampleError) throw sampleError
  if (!peakBytes || samples < 2) throw new Error('No usable memory samples were collected')
  const wasm = await readFile(`public/clpr/${manifest.commit}/search.wasm.gz`)
  if (wasm.length !== manifest.wasm.gzipBytes) throw new Error('Compressed Wasm size differs from its manifest')
  // parseRecording is the recording's definition: a run it rejects is never written.
  const recording = parseRecording({
    schemaVersion: 1,
    meta: {
      recordedAt: new Date().toISOString(), siteCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      sourceFingerprint: fingerprint, clprCommit: manifest.commit, workerSha256,
      browser: await browser.version(), platform: `${platform()} ${arch()} ${release()}`,
      ciRun: process.env.GITHUB_ACTIONS === 'true' ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
      wasmGzipBytes: wasm.length, downloadBytes: [...downloads.values()].reduce((sum, bytes) => sum + bytes, 0),
      downloads: Object.fromEntries(downloads), startupMs: result.startupMs,
      memory: { metric: 'sampled Chromium process-tree RSS', peakBytes, sampleIntervalMs: 50, samples }, budget,
      postgres: result.ready.version, migrations: result.ready.migrations,
    },
    results: result.results,
  })
  // Atomic replacement keeps a failed/cancelled recording from damaging the committed fallback.
  const path = 'src/desk/inspector/recorded-run.json'
  await writeFile(path + '.tmp', JSON.stringify(recording, null, 2) + '\n')
  await rename(path + '.tmp', path)
  console.log(`Recorded ${recording.results.length} sizes; ${(peakBytes / 1048576).toFixed(1)} MiB sampled peak RSS; ${(recording.meta.downloadBytes / 1e6).toFixed(2)} MB download.`)
} finally {
  clearInterval(timer); await sampling
  await browser?.close(); await browserServer?.close()
  await new Promise(resolve => server.close(resolve))
}
