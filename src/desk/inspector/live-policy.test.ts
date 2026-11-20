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

test('live policy enforces measured budgets and rejects stale measurements', () => {
  const meta = recorded(), hash = meta.sourceFingerprint
  const baselinePeak = meta.memory.peakBytes
  const measuredManifest = { commit: meta.clprCommit, wasm: { gzipBytes: meta.wasmGzipBytes } }
  const gate = () => liveGate(meta, hash, measuredManifest)
  expect(gate().allowed).toBe(true)
  expect(liveGate({ ...meta, wasmGzipBytes: 6000000 }, hash, { ...measuredManifest, wasm: { gzipBytes: 6000000 } }).allowed).toBe(true)
  meta.memory.peakBytes = meta.budget.maxPeakRssBytes
  expect(gate().allowed).toBe(true)
  meta.memory.peakBytes++
  expect(gate()).toEqual({ allowed: false, reason: 'Clpr live mode is off: recorded peak memory exceeds the 2,048 MiB budget.' })
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
  expect(liveGate(recorded(), hash, { ...measuredManifest, wasm: { gzipBytes: 6000001 } })).toEqual({ allowed: false, reason: 'Clpr live mode is off: compressed Wasm exceeds the 6 MB budget.' })
})
