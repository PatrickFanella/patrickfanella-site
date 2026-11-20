import { expect, test } from 'vitest'
import data from './recorded-run.json' with { type: 'json' }
import { liveGate, type Recording } from './live-policy'
import { manifest } from '../clpr-protocol'

const recording = data as Recording

test('live policy enforces measured budgets and rejects stale or missing measurements', () => {
  const meta = structuredClone(recording.meta), hash = meta.sourceFingerprint
  // Exercise the allowed boundary even when the actual CI measurement disables live mode.
  const baselinePeak = meta.budget.maxPeakRssBytes / 2
  meta.memory.peakBytes = baselinePeak
  meta.wasmGzipBytes = 5000000
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
  meta.clprCommit = manifest.commit
  meta.memory.samples = 0
  expect(gate().allowed).toBe(false)
  expect(liveGate(recording.meta, hash, { ...manifest, wasm: { gzipBytes: 6000001 } })).toMatchObject({ allowed: false, reason: expect.stringContaining('6 MB budget') })
})
