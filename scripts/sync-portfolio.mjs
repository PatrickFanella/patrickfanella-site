import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

const repository = 'subculture-collective/patrickfanella-co'
const commit = '9ed782785c7366b04bf0c626b39f8a6fcf1e3b54'
const file = 'db/seed/portfolio.json'
// Optional local clone avoids a network request; either path reads the exact pinned Git bytes.
const local = process.argv[2]
let raw
if (local) raw = execFileSync('git', ['-C', local, 'show', `${commit}:${file}`])
else raw = execFileSync('gh', ['api', `repos/${repository}/contents/${file}?ref=${commit}`, '-H', 'Accept: application/vnd.github.raw+json'])
const { projects } = JSON.parse(raw)
if (!Array.isArray(projects) || !projects.length || new Set(projects.map(p => p.slug)).size !== projects.length)
  throw new Error('Expected a nonempty project catalog with unique slugs')
const target = new URL('../src/content/', import.meta.url)
await mkdir(target, { recursive: true })
await writeFile(new URL('portfolio.json', target), raw)
await writeFile(new URL('portfolio-provenance.json', target), JSON.stringify({
  repository, file, commit, sha256: createHash('sha256').update(raw).digest('hex'), projects: projects.length,
}, null, 2) + '\n')
console.log(`Synced ${projects.length} projects from ${commit}`)
