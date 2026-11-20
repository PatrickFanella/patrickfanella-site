import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import sharp from 'sharp'
import { socialCardPath } from '../src/content/project-catalog.mjs'

// This script rewrites the selection and the asset manifest, so it reads those two files whole
// instead of the joined catalog, and takes only the catalog's path rules.
const evidence = JSON.parse(await readFile('docs/evidence/portfolio-2026-11-16/captures.json', 'utf8'))
const selection = JSON.parse(await readFile('src/content/selected-projects.json', 'utf8'))
const assets = JSON.parse(await readFile('src/content/project-assets-provenance.json', 'utf8'))
await mkdir('public/assets/projects/screenshots', { recursive: true })
for (const project of selection.projects) {
  project.media = []
  const captures = evidence.captures.filter(capture => capture.slug === project.slug)
  for (const capture of captures) {
    const raw = await readFile(capture.original)
    if (createHash('sha256').update(raw).digest('hex') !== capture.originalSha256) throw new Error(`Capture changed: ${capture.original}`)
    const stem = `/assets/projects/screenshots/2026-11-16-${capture.slug}-${capture.state}`
    for (const width of [640, 1280]) {
      const path = `${stem}-${width}.webp`
      const bytes = await sharp(raw).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
      const dimensions = await sharp(bytes).metadata()
      await writeFile(`public${path}`, bytes)
      const entry = { path, sha256: createHash('sha256').update(bytes).digest('hex'), width: dimensions.width, height: dimensions.height, capture: capture.original }
      assets.files = assets.files.filter(file => file.path !== path)
      assets.files.push(entry)
    }
    project.media.push({ src: `${stem}-1280.webp`, srcSet: `${stem}-640.webp 640w, ${stem}-1280.webp 1280w`, alt: capture.caption, caption: `${capture.caption} Captured November 16, 2026.`, capturedAt: capture.capturedAt })
  }
  if (captures.length) {
    project.thumbnailUrl = project.media[0].src
    project.thumbnailAlt = project.media[0].alt
    const path = socialCardPath(project.slug)
    const bytes = await sharp(captures[0].original).resize(1200, 630, { fit: 'contain', background: project.brandBackground ?? '#e9eff2' }).png().toBuffer()
    await mkdir(dirname(`public${path}`), { recursive: true })
    await writeFile(`public${path}`, bytes)
    assets.files = assets.files.filter(file => file.path !== path)
    assets.files.push({ path, sha256: createHash('sha256').update(bytes).digest('hex'), width: 1200, height: 630, capture: captures[0].original })
  }
}
assets.captureEvidence = 'docs/evidence/portfolio-2026-11-16/captures.json'
assets.importedBaseline = 'The repository and commit fields identify the original imported assets. Entries with a capture field are site-owned derivatives of the linked dated screenshot, not files from that imported commit.'
await writeFile('src/content/project-assets-provenance.json', JSON.stringify(assets, null, 2) + '\n')
await writeFile('src/content/selected-projects.json', JSON.stringify(selection, null, 2) + '\n')
console.log(`Processed ${evidence.captures.length} original app screenshots, their responsive derivatives and four social images.`)
