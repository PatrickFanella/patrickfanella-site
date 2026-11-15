import policy from './recording-policy.json' with { type: 'json' }
import type { Result } from './render'

export interface RecordingMeta {
  recordedAt: string; siteCommit: string; sourceFingerprint: string; clprCommit: string
  workerSha256: string; browser: string; platform: string; ciRun: string | null
  wasmGzipBytes: number; downloadBytes: number; downloads: Record<string, number>; startupMs: number
  memory: { metric: string; peakBytes: number; sampleIntervalMs: number; samples: number }
  budget: typeof policy; postgres: string; migrations: number
}
export interface Recording { schemaVersion: 1; meta: RecordingMeta; results: Result[] }

/** A stale or unmeasured artifact stays readable, but cannot authorize a large download. */
export function liveGate(meta: RecordingMeta, fingerprint: string, manifest: { commit: string; wasm: { gzipBytes: number } }) {
  let reason = ''
  if (manifest.wasm.gzipBytes > policy.maxWasmGzipBytes) reason = 'Clpr live mode is off: compressed Wasm exceeds the 6 MB budget.'
  else if (!Number.isFinite(meta.memory.peakBytes) || meta.memory.peakBytes <= 0 || !Number.isFinite(meta.memory.samples) || meta.memory.samples < 2
    || meta.memory.metric !== 'sampled Chromium process-tree RSS') reason = 'Clpr live mode is off: no usable memory measurement is recorded.'
  else if (meta.memory.peakBytes > policy.maxPeakRssBytes) reason = 'Clpr live mode is off: recorded peak memory exceeds the 2,048 MiB budget.'
  else if (meta.sourceFingerprint !== fingerprint || meta.clprCommit !== manifest.commit || meta.wasmGzipBytes !== manifest.wasm.gzipBytes
    || meta.budget.maxWasmGzipBytes !== policy.maxWasmGzipBytes || meta.budget.maxPeakRssBytes !== policy.maxPeakRssBytes) reason = 'Clpr live mode is off: the worker or its budget changed since this recording. A new recording is needed.'
  else if (!Number.isFinite(meta.downloadBytes) || meta.downloadBytes < meta.wasmGzipBytes || !Number.isFinite(meta.startupMs) || meta.startupMs < 0) reason = 'Clpr live mode is off: its download or startup measurement is missing.'
  return { allowed: !reason, reason }
}
