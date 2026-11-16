import { selectedProjects } from '../content/project-presentation'
import studies from '../content/project-case-studies.json'

export function GET() {
  const paths = ['/', '/projects/', '/resume/', '/contact/', '/desk/', '/motion/', '/case-studies/', '/case-studies/clpr-search/', '/case-studies/clpr-request/',
    ...studies.studies.map(study => `/case-studies/${study.slug}/`),
    ...selectedProjects.map(project => `/projects/${project.slug}/`)]
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map(path => `  <url><loc>https://patrickfanella.co${path}</loc></url>`).join('\n')}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
