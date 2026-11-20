import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { manifest } from '../clpr-protocol'
import policy from './recording-policy.json' with { type: 'json' }
import { sourceFingerprint, type RecordingMeta } from './recording.mjs'

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

/** The gate for this checkout, as the Desk page and the browser tests both build it: the sources'
 * fingerprint and the size of the pinned Wasm file on disk. Build time and tests only (reads files). */
export const checkoutLiveGate = (meta: RecordingMeta) => liveGate(meta, sourceFingerprint(createHash('sha256'), readFileSync),
  { commit: manifest.commit, wasm: { gzipBytes: statSync(`public/clpr/${manifest.commit}/search.wasm.gz`).size } })
