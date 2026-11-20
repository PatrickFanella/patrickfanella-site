import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { contentSecurityPolicy } from '../../content/site-facts.mjs'
import { fixtureCount, parseRecording, sourceFingerprint, tableSizes } from './recording.mjs'

test('the recording covers the eight fixtures alone and with 1,000 to 50,000 generated clips', () => {
  expect(fixtureCount).toBe(8)
  expect(tableSizes).toEqual([8, 1008, 10008, 30008, 50008])
})

const fingerprint = (read: (path: string) => string) => sourceFingerprint(createHash('sha256'), read)
/** The input paths, in the order the fingerprint reads them. */
const paths = () => { const read: string[] = []; fingerprint(path => (read.push(path), '')); return read }

test('the fingerprint covers every input path and its bytes and the security policy, and changes when one input changes', () => {
  const read = (path: string) => `contents of ${path}`
  // SHA-256 over path, NUL, bytes, NUL for each input in order, then the name, policy and NUL of the
  // content security policy from site-facts.mjs.
  const expected = createHash('sha256')
  for (const path of paths()) expected.update(`${path}\0${read(path)}\0`)
  expected.update(`contentSecurityPolicy\0${contentSecurityPolicy}\0`)
  expect(fingerprint(read)).toBe(expected.digest('hex'))
  expect(paths()).toEqual([
    'astro.config.mjs', 'scripts/record-clpr.mjs', 'src/desk/inspector/recording.mjs', 'package-lock.json',
    'public/clpr/manifest.json', 'src/desk/clpr.worker.ts', 'src/desk/clpr-protocol.ts', 'src/desk/worker-replies.ts', 'src/desk/worker-client.mjs',
    'src/desk/inspector/capture.ts', 'src/desk/inspector/wire.ts', 'src/desk/inspector/plans.ts',
  ])
  for (const changed of paths()) {
    expect(fingerprint(path => path === changed ? `${read(path)} ` : read(path)), changed).not.toBe(fingerprint(read))
  }
})

// A literal recording, so the shape is tested whatever recorded-run.json holds.
const plan = { Plan: { 'Node Type': 'Seq Scan', 'Total Cost': 1.1, 'Startup Cost': 0, 'Plan Rows': 2 }, 'Execution Time': 0.1 }
const valid = () => ({
  schemaVersion: 1,
  meta: {
    recordedAt: '2026-11-15T08:46:07.846Z', siteCommit: 'a'.repeat(40), sourceFingerprint: 'b'.repeat(64), clprCommit: 'c'.repeat(40),
    workerSha256: 'd'.repeat(64), browser: '159.0.8154.6', platform: 'linux x64', ciRun: null as string | null,
    wasmGzipBytes: 5, downloadBytes: 7, downloads: { '/search.wasm.gz': 5, '/worker.js': 2 }, startupMs: 0,
    memory: { metric: 'sampled Chromium process-tree RSS', peakBytes: 1024, sampleIntervalMs: 50, samples: 2 },
    budget: { maxWasmGzipBytes: 6000000, maxPeakRssBytes: 2147483648 }, postgres: '17.5', migrations: 3,
  },
  results: [8, 1008, 10008, 30008, 50008].map((rows, id) => ({
    ev: 'result', id, url: '/api/v1/search?q=world+record&type=clips', ms: 1.5, rows,
    response: { status: 200, headers: {}, body: '{"counts":{"clips":2},"results":{"clips":[{},{}]}}' },
    calls: [{ ms: 0, statements: [], sent: [{ type: 'S', name: 'Sync', bytes: 5, detail: '', hex: '53 00 00 00 04' }], received: [] }],
    plan: { rows, natural: plan, seq: plan, gin: plan },
  })),
})

test('a complete recording is returned as it was given', () => {
  expect(parseRecording(valid())).toEqual(valid())
  const ci = valid()
  ci.meta.ciRun = 'https://github.com/PatrickFanella/patrickfanella-site/actions/runs/1'
  expect(parseRecording(ci).meta.ciRun).toBe('https://github.com/PatrickFanella/patrickfanella-site/actions/runs/1')
})

test('a recording with a missing field is rejected by name', () => {
  type Draft = ReturnType<typeof valid>
  const without = (remove: (draft: Draft) => unknown) => () => { const draft = valid(); remove(draft); parseRecording(draft) }
  const meta = (key: string) => without(draft => Reflect.deleteProperty(draft.meta, key))
  expect(without(draft => Reflect.deleteProperty(draft, 'schemaVersion'))).toThrow('Invalid Clpr recording: schemaVersion')
  expect(without(draft => Reflect.deleteProperty(draft, 'meta'))).toThrow('Invalid Clpr recording: meta')
  expect(without(draft => Reflect.deleteProperty(draft, 'results'))).toThrow('Invalid Clpr recording: results')
  for (const key of ['recordedAt', 'siteCommit', 'sourceFingerprint', 'clprCommit', 'workerSha256', 'browser', 'platform', 'ciRun',
    'wasmGzipBytes', 'downloadBytes', 'downloads', 'startupMs', 'memory', 'budget', 'postgres', 'migrations']) {
    expect(meta(key), key).toThrow(`Invalid Clpr recording: meta.${key}`)
  }
  expect(without(draft => Reflect.deleteProperty(draft.meta.memory, 'peakBytes'))).toThrow('Invalid Clpr recording: meta.memory.peakBytes')
  expect(without(draft => Reflect.deleteProperty(draft.meta.budget, 'maxPeakRssBytes'))).toThrow('Invalid Clpr recording: meta.budget.maxPeakRssBytes')
  expect(without(draft => Reflect.deleteProperty(draft.results[1], 'plan'))).toThrow('Invalid Clpr recording: results[1].plan')
  expect(without(draft => Reflect.deleteProperty(draft.results[1].plan, 'gin'))).toThrow('Invalid Clpr recording: results[1].plan.gin')
  expect(without(draft => Reflect.deleteProperty(draft.results[1].plan, 'rows'))).toThrow('Invalid Clpr recording: results[1].plan.rows')
  expect(without(draft => Reflect.deleteProperty(draft.results[2], 'id'))).toThrow('Invalid Clpr recording: results[2].id')
  expect(without(draft => Reflect.deleteProperty(draft.results[3].response, 'headers'))).toThrow('Invalid Clpr recording: results[3].response.headers')
  expect(without(draft => Reflect.deleteProperty(draft.results[4], 'calls'))).toThrow('Invalid Clpr recording: results[4].calls')
  expect(without(draft => Reflect.deleteProperty(draft.results[4].calls[0], 'statements'))).toThrow('Invalid Clpr recording: results[4].calls.statements')
  expect(without(draft => Reflect.deleteProperty(draft.results[4].calls[0], 'sent'))).toThrow('Invalid Clpr recording: results[4].calls.sent')
  expect(without(draft => Reflect.deleteProperty(draft.results[4].calls[0].sent[0], 'hex'))).toThrow('Invalid Clpr recording: results[4].calls.sent: Sync')
  expect(without(draft => draft.results.pop())).toThrow('Invalid Clpr recording: results')
})

test('a null where an object belongs is rejected by name', () => {
  const nulled = (target: (draft: ReturnType<typeof valid>) => object, key: string) => () => { const draft = valid(); Reflect.set(target(draft), key, null); parseRecording(draft) }
  expect(() => parseRecording(null)).toThrow('Invalid Clpr recording: schemaVersion')
  expect(nulled(draft => draft, 'meta')).toThrow('Invalid Clpr recording: meta')
  expect(nulled(draft => draft.meta, 'memory')).toThrow('Invalid Clpr recording: meta.memory')
  expect(nulled(draft => draft.meta, 'budget')).toThrow('Invalid Clpr recording: meta.budget')
  expect(nulled(draft => draft.meta, 'downloads')).toThrow('Invalid Clpr recording: meta.downloads')
  expect(nulled(draft => draft, 'results')).toThrow('Invalid Clpr recording: results')
  expect(nulled(draft => draft.results, '0')).toThrow('Invalid Clpr recording: results[0].rows')
  expect(nulled(draft => draft.results[0], 'response')).toThrow('Invalid Clpr recording: results[0].response')
  expect(nulled(draft => draft.results[0].calls, '0')).toThrow('Invalid Clpr recording: results[0].calls.ms')
  expect(nulled(draft => draft.results[0].calls[0], 'received')).toThrow('Invalid Clpr recording: results[0].calls.received')
})

test('fields the definition does not name are left out, so the checker can find them', () => {
  const extra = valid()
  Object.assign(extra, { note: 1 })
  Object.assign(extra.meta, { host: 'kvant' })
  Object.assign(extra.results[0], { planError: 'none' })
  Object.assign(extra.results[0].response, { ok: true })
  Object.assign(extra.results[0].calls[0], { rows: 2 })
  Object.assign(extra.results[0].plan, { analyze: true })
  expect(parseRecording(extra)).toEqual(valid())
})

test('measurements the live gate would refuse are rejected when the recording is made', () => {
  const broken = (change: (draft: ReturnType<typeof valid>) => void) => () => { const draft = valid(); change(draft); parseRecording(draft) }
  expect(broken(draft => { draft.meta.memory.samples = 1 })).toThrow('meta.memory.samples')
  expect(broken(draft => { draft.meta.memory.metric = 'JS heap' })).toThrow('meta.memory.metric')
  expect(broken(draft => { draft.meta.downloadBytes = 8 })).toThrow('meta.downloadBytes')
  expect(broken(draft => { draft.meta.siteCommit = 'HEAD' })).toThrow('meta.siteCommit')
  expect(broken(draft => { draft.results[2].rows = 10000 })).toThrow('results[2].rows')
  expect(broken(draft => { draft.results[0].response.status = 500 })).toThrow('results[0].response')
  expect(broken(draft => { draft.results[0].calls[0].sent[0].bytes = 4 })).toThrow('results[0].calls.sent: Sync')
})
