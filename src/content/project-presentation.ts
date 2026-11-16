import catalog from './portfolio.json' with { type: 'json' }
import selection from './selected-projects.json' with { type: 'json' }
import assets from './project-assets-provenance.json' with { type: 'json' }
import resume from './resume.json' with { type: 'json' }

export interface ProjectMedia {
  src: string
  srcSet?: string
  alt: string
  caption: string
  capturedAt?: string
}
export interface Project {
  slug: string
  title: string
  summary: string
  description: string
  problem: string
  role: string
  year: number
  deliveryStatus?: string
  periodLabel?: string
  stack: string[]
  highlights: string[]
  architecture: string[]
  lessons: string[]
  media: ProjectMedia[]
  liveUrl?: string | null
  repoUrl?: string
  sourceUrl?: string
  thumbnailUrl?: string
  thumbnailAlt?: string
  brandBackground?: string
  relatedProjects?: { slug: string; label: string; relationship: string }[]
}
export const reviewedAt = selection.reviewedAt
export const selectedProjects: Project[] = selection.projects
const selected = new Map(selectedProjects.map(project => [project.slug, project]))
// Keep previously published detail routes while refreshing the current selection.
export const allProjects: Project[] = [
  ...catalog.projects.map(project => selected.get(project.slug) ?? project),
  ...selectedProjects.filter(project => !catalog.projects.some(old => old.slug === project.slug)),
]
export const featuredSlugs = ['clpr', 'clustr', 'rekolekt', 'undertow']
export const supportingProjects = selectedProjects.filter(project => !featuredSlugs.includes(project.slug))
export const employmentFeature = {
  title: 'DeliverZero',
  ownership: 'Full-stack engineer, working directly with the CTO',
  outcome: resume.deliverzero_bullets[1],
  href: '/resume/#deliverzero',
}
export const featuredProjects = featuredSlugs.map(slug => {
  const project = selected.get(slug)!
  const media = project.media[0]
  const dimensions = assets.files.find(file => file.path === media?.src)
  return { slug, project, media, dimensions, study: `/case-studies/${slug}/` }
})
