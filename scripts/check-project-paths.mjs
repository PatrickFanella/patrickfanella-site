import { readFile, access } from 'node:fs/promises'
import { catalog } from '../src/content/projects.mjs'
import { redirects as legacy } from '../src/content/site-facts.mjs'

// Importing the catalog runs the join, so content files that disagree fail this check too.
const root = new URL('../', import.meta.url)
const snapshot = new URL('docs/evidence/current-site-sitemap.xml', root)
const xml = process.argv.includes('--live')
  ? await fetch('https://patrickfanella.co/sitemap.xml').then(response => {
    if (!response.ok) throw new Error(`Sitemap HTTP ${response.status}`)
    return response.text()
  }) : await readFile(snapshot, 'utf8')
const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => new URL(url).pathname)
const projectPaths = paths.filter(path => path.startsWith('/projects/'))
if (!projectPaths.length) throw new Error('Sitemap contains no project detail paths')
const redirects = new Map(Object.entries(legacy))
for (const path of new Set([...catalog.all.map(project => project.path), ...projectPaths, ...redirects.keys()])) {
  const normalized = path.replace(/\/$/, '')
  await access(new URL(`dist${normalized}/index.html`, root))
  if (redirects.has(normalized)) {
    const html = await readFile(new URL(`dist${normalized}/index.html`, root), 'utf8')
    if (!html.includes(redirects.get(normalized))) throw new Error(`Wrong redirect for ${path}`)
  }
}
console.log(`All ${catalog.all.length} catalog pages, ${projectPaths.length} sitemap project paths and ${redirects.size} legacy redirects exist.`)

for (const { study } of catalog.studied) await access(new URL(`dist${study.path}index.html`, root))
console.log(`All ${catalog.studied.length} product studies and the curated ${catalog.selected.length}-project selection exist.`)
