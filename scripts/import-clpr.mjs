// Copy a downloaded Clpr CI/release payload after checking its manifest and all file hashes.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'

const source = process.argv[2]
assert(source, 'Usage: node scripts/import-clpr.mjs <downloaded-artifact-directory>')
const root = new URL('../public/clpr/', import.meta.url)
const manifestText = await readFile(resolve(source, 'manifest.json'), 'utf8')
const m = JSON.parse(manifestText)
assert.equal(m.schemaVersion, 1)
assert.equal(m.repository, 'subculture-collective/clpr')
assert.match(m.commit, /^[0-9a-f]{40}$/)
assert(Number.isFinite(Date.parse(m.date)))
assert.equal(typeof m.goVersion, 'string')
assert.deepEqual(m.buildTags, ['nomsgpack'])
assert.equal(typeof m.builtInClprCI, 'boolean')
assert.equal(m.sourceDirty, false, 'Commit Clpr changes before pinning an artifact')
assert(m.wasm.gzipBytes > 0 && m.wasm.gzipBytes <= 6_000_000)
if (m.builtInClprCI) assert.match(m.ciRun, /^https:\/\/github.com\/subculture-collective\/clpr\/actions\/runs\/\d+$/)
const names = ['search.wasm.gz', 'migrations.json', 'wasm_exec.js', 'GO-LICENSE']
assert.deepEqual(Object.keys(m.files).sort(), [...names].sort())
for (const name of names) {
  const data = await readFile(resolve(source, name))
  assert.equal(data.length, m.files[name].bytes, `${name}: size mismatch`)
  assert.equal(createHash('sha256').update(data).digest('hex'), m.files[name].sha256, `${name}: hash mismatch`)
}
const packed = await readFile(resolve(source, 'search.wasm.gz'))
assert.equal(packed.length, m.wasm.gzipBytes)
const raw = gunzipSync(packed, { maxOutputLength: m.wasm.bytes })
assert.equal(raw.length, m.wasm.bytes)
assert.equal(createHash('sha256').update(raw).digest('hex'), m.wasm.sha256)
const migrations = JSON.parse(await readFile(resolve(source, 'migrations.json'), 'utf8'))
assert.equal(migrations.length, m.migrationCount)
assert(migrations.length > 0)
for (let i = 0; i < migrations.length; i++) {
  assert.match(migrations[i].name, /^\d+_.+\.up\.sql$/)
  assert.equal(typeof migrations[i].sql, 'string')
  if (i) assert(migrations[i - 1].name < migrations[i].name, 'Migrations must be ordered')
}
// Validate the complete bundle before writing any part of the pin.
const dest = new URL(`${m.commit}/`, root)
await mkdir(dest, { recursive: true })
for (const name of names) await copyFile(resolve(source, name), new URL(name, dest))
await writeFile(new URL('manifest.json', root), manifestText)
console.log(`Pinned Clpr ${m.commit}: ${m.wasm.gzipBytes} gzip bytes, ${m.migrationCount} migrations, ${m.builtInClprCI ? 'Clpr CI' : 'local build'}`)
