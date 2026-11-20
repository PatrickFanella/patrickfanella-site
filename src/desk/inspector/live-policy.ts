import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { manifest } from '../clpr-protocol'
import policy from './recording-policy.json' with { type: 'json' }
import { sourceFingerprint, type RecordingMeta } from './recording.mjs'

const wasmBudget = `${(policy.maxWasmGzipBytes / 1e6).toLocaleString('en-US')} MB`
const memoryBudget = `${(policy.maxPeakRssBytes / 2 ** 20).toLocaleString('en-US')} MiB`

/**
 * A stale or over-budget artifact stays readable, but cannot authorize a large download. The
 * measurements themselves (memory metric and samples, download and startup) are checked by
 * `parseRecording`, which every recording passes through.
 */
export function liveGate(meta: RecordingMeta, fingerprint: string, manifest: { commit: string; wasm: { gzipBytes: number } }) {
  let reason = ''
  if (manifest.wasm.gzipBytes > policy.maxWasmGzipBytes) reason = `Clpr live mode is off: compressed Wasm exceeds the ${wasmBudget} budget.`
  else if (meta.memory.peakBytes > policy.maxPeakRssBytes) reason = `Clpr live mode is off: recorded peak memory exceeds the ${memoryBudget} budget.`
  else if (meta.sourceFingerprint !== fingerprint || meta.clprCommit !== manifest.commit || meta.wasmGzipBytes !== manifest.wasm.gzipBytes
    || meta.budget.maxWasmGzipBytes !== policy.maxWasmGzipBytes || meta.budget.maxPeakRssBytes !== policy.maxPeakRssBytes) reason = 'Clpr live mode is off: the worker or its budget changed since this recording. A new recording is needed.'
  return { allowed: !reason, reason }
}

/** The gate for this checkout, as the Desk page and the browser tests both build it: the sources'
 * fingerprint and the size of the pinned Wasm file on disk. Build time and tests only (reads files). */
export const checkoutLiveGate = (meta: RecordingMeta) => liveGate(meta, sourceFingerprint(createHash('sha256'), readFileSync),
  { commit: manifest.commit, wasm: { gzipBytes: statSync(`public/clpr/${manifest.commit}/search.wasm.gz`).size } })
