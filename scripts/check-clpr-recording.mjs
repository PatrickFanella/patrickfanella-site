import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const recording = JSON.parse(await readFile('src/desk/inspector/recorded-run.json', 'utf8'))
assert.equal(recording.schemaVersion, 1)
const { meta, results } = recording
assert.ok(Number.isFinite(Date.parse(meta.recordedAt)))
for (const key of ['sourceFingerprint', 'workerSha256']) assert.match(meta[key], /^[a-f0-9]{64}$/)
for (const key of ['siteCommit', 'clprCommit']) assert.match(meta[key], /^[a-f0-9]{40}$/)
assert.ok(meta.browser && meta.platform && meta.postgres && meta.migrations > 0)
assert.ok(meta.ciRun === null || /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/.test(meta.ciRun))
for (const n of [meta.wasmGzipBytes, meta.downloadBytes, meta.memory.peakBytes, meta.memory.sampleIntervalMs, meta.memory.samples, meta.budget.maxPeakRssBytes, meta.budget.maxWasmGzipBytes]) assert.ok(Number.isFinite(n) && n > 0)
assert.ok(Number.isFinite(meta.startupMs) && meta.startupMs >= 0)
assert.equal(meta.memory.metric, 'sampled Chromium process-tree RSS')
assert.equal(meta.downloadBytes, Object.values(meta.downloads).reduce((sum, n) => sum + n, 0))
assert.deepEqual(results.map(result => result.rows), [8, 1008, 10008, 30008, 50008])
for (const result of results) {
  assert.equal(result.ev, 'result'); assert.equal(result.response.status, 200)
  assert.equal(result.url, '/api/v1/search?q=world+record&type=clips')
  const body = JSON.parse(result.response.body)
  assert.equal(body.counts.clips, 2); assert.equal(body.results.clips.length, 2)
  assert.ok(Number.isFinite(result.ms) && result.ms >= 0)
  assert.ok(result.calls.length > 0)
  for (const call of result.calls) {
    assert.ok(Number.isFinite(call.ms) && call.ms >= 0)
    for (const message of [...call.sent, ...call.received]) {
      assert.ok(message.bytes > 0 && message.name)
      assert.equal(message.hex.split(' ').length, message.bytes)
    }
  }
  for (const kind of ['natural', 'seq', 'gin']) {
    assert.ok(Number.isFinite(result.plan[kind].Plan['Total Cost']))
    assert.ok(Number.isFinite(result.plan[kind]['Execution Time']))
  }
}
console.log(`Clpr recording valid: ${results.length} sizes, ${meta.ciRun ? 'CI' : 'local'} provenance, ${meta.recordedAt}.`)
if (process.argv.includes('--built')) {
  const built = JSON.parse(await readFile('dist/_astro/clpr-recording-build.json', 'utf8'))
  assert.equal(meta.sourceFingerprint, built.sourceFingerprint, 'Recording sources differ from the built worker')
  assert.equal(meta.workerSha256, built.workerSha256, 'Recording worker differs from the built worker')
}
