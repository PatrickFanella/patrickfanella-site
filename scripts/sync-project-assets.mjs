import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import sharp from 'sharp'

const { repository, commit } = JSON.parse(await readFile(new URL('../src/content/portfolio-provenance.json', import.meta.url)))
const { projects } = JSON.parse(await readFile(new URL('../src/content/portfolio.json', import.meta.url)))
const assets = new Set()
for (const project of projects) {
  if (project.thumbnailUrl) assets.add(project.thumbnailUrl)
  for (const media of project.media) {
    assets.add(media.src)
    for (const candidate of media.srcSet?.split(',') ?? []) assets.add(candidate.trim().split(/\s+/)[0])
  }
}
const files = []
for (const asset of [...assets].sort()) {
  if (!/^\/assets\/[\w./-]+$/.test(asset) || asset.includes('..')) throw new Error(`Invalid asset path: ${asset}`)
  const file = `web/public${asset}`
  const raw = process.argv[2]
    ? execFileSync('git', ['-C', process.argv[2], 'show', `${commit}:${file}`])
    : execFileSync('gh', ['api', `repos/${repository}/contents/${file}?ref=${commit}`, '-H', 'Accept: application/vnd.github.raw+json'])
  const target = new URL(`../public${asset}`, import.meta.url)
  await mkdir(dirname(target.pathname), { recursive: true })
  await writeFile(target, raw)
  const { width, height } = await sharp(raw).metadata()
  files.push({ path: asset, sha256: createHash('sha256').update(raw).digest('hex'), width, height })
}
// PNGs work in social previews even when the source image is an SVG. No remote image requests.
await mkdir(new URL('../public/assets/projects/social/', import.meta.url), { recursive: true })
for (const project of projects) {
  if (!project.thumbnailUrl) throw new Error(`Missing social image for ${project.slug}`)
  const input = new URL(`../public${project.thumbnailUrl}`, import.meta.url)
  await sharp(input.pathname).resize(1200, 630, { fit: 'contain', background: project.brandBackground ?? '#e9eff2' })
    .png().toFile(new URL(`../public/assets/projects/social/${project.slug}.png`, import.meta.url).pathname)
}
await writeFile(new URL('../src/content/project-assets-provenance.json', import.meta.url), JSON.stringify({ repository, commit, files }, null, 2) + '\n')
console.log(`Copied ${files.length} pinned assets and rendered ${projects.length} social images.`)
