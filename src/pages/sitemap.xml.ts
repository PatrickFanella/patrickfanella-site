import { selectedProjects, studiedProjects } from '../content/project-presentation'
import { siteMetadata } from '../content/site-metadata'
import { routePaths } from '../content/site-facts.mjs'

const xml = (value: string) => value.replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!)

export function GET() {
  const pages = [
    ...routePaths().map(path => ({ path, images: [] as string[] })),
    ...studiedProjects.map(project => ({ path: project.study.path, images: project.media.map(media => media.src) })),
    ...selectedProjects.map(project => ({ path: project.path, images: project.media.map(media => media.src) })),
  ]
  const entries = pages.map(page => {
    const images = page.images.map(image => `<image:image><image:loc>${xml(new URL(image, siteMetadata.origin).href)}</image:loc></image:image>`).join('')
    return `  <url><loc>${xml(new URL(page.path, siteMetadata.origin).href)}</loc>${images}</url>`
  })
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.join('\n')}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
