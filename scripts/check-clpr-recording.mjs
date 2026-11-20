import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parseRecording, sourceFingerprint } from '../src/desk/inspector/recording.mjs'

const raw = JSON.parse(readFileSync('src/desk/inspector/recorded-run.json', 'utf8'))
const { meta, results } = parseRecording(raw)
// The file holds exactly what the recorder writes: no field missing, none unknown.
assert.deepEqual({ schemaVersion: 1, meta, results }, raw)
const fingerprint = sourceFingerprint(createHash('sha256'), readFileSync)
console.log(`Clpr recording valid: ${results.length} sizes, ${meta.ciRun ? 'CI' : 'local'} provenance, ${meta.recordedAt}; its sources ${meta.sourceFingerprint === fingerprint ? 'match this checkout' : 'have changed since, so live mode is off'}.`)
if (process.argv.includes('--built')) {
  const built = JSON.parse(readFileSync('dist/_astro/clpr-recording-build.json', 'utf8'))
  assert.equal(built.sourceFingerprint, fingerprint, 'dist/ was built from other sources than this checkout')
  assert.equal(meta.sourceFingerprint, built.sourceFingerprint, 'Recording sources differ from the built worker')
  assert.equal(meta.workerSha256, built.workerSha256, 'Recording worker differs from the built worker')
}
