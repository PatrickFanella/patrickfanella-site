import { readFile, access } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const imported = JSON.parse(await readFile(new URL('src/content/portfolio.json', root)))
const selected = JSON.parse(await readFile(new URL('src/content/selected-projects.json', root)))
const studies = JSON.parse(await readFile(new URL('src/content/project-case-studies.json', root)))
const projects = [...new Map([...imported.projects, ...selected.projects].map(project => [project.slug, project])).values()]
if (selected.projects.length !== 16 || studies.studies.length !== 4) throw new Error('Expected four case studies and twelve supporting projects')
const snapshot = new URL('docs/evidence/current-site-sitemap.xml', root)
const xml = process.argv.includes('--live')
  ? await fetch('https://patrickfanella.co/sitemap.xml').then(response => {
    if (!response.ok) throw new Error(`Sitemap HTTP ${response.status}`)
    return response.text()
  }) : await readFile(snapshot, 'utf8')
const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => new URL(url).pathname)
const projectPaths = paths.filter(path => path.startsWith('/projects/'))
if (!projectPaths.length) throw new Error('Sitemap contains no project detail paths')
const redirects = new Map([
  ['/projects/transcript-create', '/projects/rekolekt/'],
  ['/projects/discord-spywatcher', '/projects/backline/'],
])
for (const path of new Set([...projects.map(project => `/projects/${project.slug}`), ...projectPaths, ...redirects.keys()])) {
  const normalized = path.replace(/\/$/, '')
  await access(new URL(`dist${normalized}/index.html`, root))
  if (redirects.has(normalized)) {
    const html = await readFile(new URL(`dist${normalized}/index.html`, root), 'utf8')
    if (!html.includes(redirects.get(normalized))) throw new Error(`Wrong redirect for ${path}`)
  }
}
console.log(`All ${projects.length} catalog pages, ${projectPaths.length} sitemap project paths and ${redirects.size} legacy redirects exist.`)

for (const study of studies.studies) await access(new URL(`dist/case-studies/${study.slug}/index.html`, root))
console.log('All four product studies and the curated sixteen-project selection exist.')
