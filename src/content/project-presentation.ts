// Site-owned editorial choices; the imported catalog and image provenance stay pinned.
import catalog from './portfolio.json'
import assets from './project-assets-provenance.json'
import resume from './resume.json'

export const employmentFeature = {
  title: 'DeliverZero',
  ownership: 'Full-stack engineer, working directly with the CTO',
  outcome: resume.deliverzero_bullets[1],
  href: '/resume/#deliverzero',
}
export const featuredProjects = [
  { slug: 'clpr', ownership: 'I built and operate the Go API, React client and search pipeline.', study: '/case-studies/clpr-search/' },
  { slug: 'undertow', ownership: 'I built the React editor and local WebCodecs export pipeline.', study: undefined },
].map(presentation => {
  const project = catalog.projects.find(project => project.slug === presentation.slug)!
  const media = project.media[0]
  const dimensions = assets.files.find(file => file.path === media.src)!
  return { ...presentation, project, media, dimensions }
})
