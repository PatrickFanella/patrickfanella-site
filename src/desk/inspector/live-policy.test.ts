import { expect, test } from 'vitest'
import { liveGate } from './live-policy'
import type { RecordingMeta } from './recording.mjs'
import policy from './recording-policy.json' with { type: 'json' }

// A literal recording at the allowed boundary, so the gate's rules are tested whatever recorded-run.json holds.
const recorded = (): RecordingMeta => ({
  recordedAt: '', siteCommit: '', sourceFingerprint: 'hash', clprCommit: 'commit', workerSha256: '', browser: '', platform: '', ciRun: null,
  wasmGzipBytes: 5000000, downloadBytes: 6000000, downloads: {}, startupMs: 0,
  memory: { metric: 'sampled Chromium process-tree RSS', peakBytes: policy.maxPeakRssBytes / 2, sampleIntervalMs: 50, samples: 2 },
  budget: { ...policy }, postgres: '', migrations: 0,
})

test('live policy enforces measured budgets and rejects stale or missing measurements', () => {
  const meta = recorded(), hash = meta.sourceFingerprint
  const baselinePeak = meta.memory.peakBytes
  const measuredManifest = { commit: meta.clprCommit, wasm: { gzipBytes: meta.wasmGzipBytes } }
  const gate = () => liveGate(meta, hash, measuredManifest)
  expect(gate().allowed).toBe(true)
  expect(liveGate({ ...meta, wasmGzipBytes: 6000000 }, hash, { ...measuredManifest, wasm: { gzipBytes: 6000000 } }).allowed).toBe(true)
  meta.memory.peakBytes = meta.budget.maxPeakRssBytes
  expect(gate().allowed).toBe(true)
  meta.memory.peakBytes++
  expect(gate()).toMatchObject({ allowed: false, reason: expect.stringContaining('peak memory exceeds') })
  meta.memory.peakBytes = 0
  expect(gate().allowed).toBe(false)
  meta.memory.peakBytes = baselinePeak
  meta.sourceFingerprint = 'changed'
  expect(gate()).toMatchObject({ allowed: false, reason: expect.stringContaining('new recording') })
  meta.sourceFingerprint = hash
  meta.budget.maxPeakRssBytes++
  expect(gate().allowed).toBe(false)
  meta.budget.maxPeakRssBytes--
  meta.clprCommit = 'changed'
  expect(gate().allowed).toBe(false)
  meta.clprCommit = measuredManifest.commit
  meta.memory.samples = 1
  expect(gate()).toMatchObject({ allowed: false, reason: expect.stringContaining('no usable memory measurement') })
  meta.memory.samples = 2
  meta.downloadBytes = meta.wasmGzipBytes - 1
  expect(gate()).toMatchObject({ allowed: false, reason: expect.stringContaining('download or startup measurement is missing') })
  expect(liveGate(recorded(), hash, { ...measuredManifest, wasm: { gzipBytes: 6000001 } })).toMatchObject({ allowed: false, reason: expect.stringContaining('6 MB budget') })
})
