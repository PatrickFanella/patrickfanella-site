import portfolio from './portfolio.json' with { type: 'json' }
import selection from './selected-projects.json' with { type: 'json' }
import studies from './project-case-studies.json' with { type: 'json' }
import sources from './selected-project-sources.json' with { type: 'json' }
import assets from './project-assets-provenance.json' with { type: 'json' }
import resume from './resume.json' with { type: 'json' }
import { assembleCatalog, featuredSlugs } from './project-catalog.mjs'

export type { Project, ProjectMedia, StudiedProject } from './project-catalog.mjs'

// The one join of the content files. It throws when they disagree, which fails the build and the unit tests.
const catalog = assembleCatalog({
  portfolio: portfolio.projects,
  selected: selection.projects,
  studies: studies.studies,
  sources: sources.sources,
  assets: assets.files,
  featured: featuredSlugs,
})
// Every detail route: previously published pages stay while the current selection is refreshed.
export const allProjects = catalog.all
export const selectedProjects = catalog.selected
export const featuredProjects = catalog.featured
export const supportingProjects = catalog.supporting
/** The projects with a product case study, in the study file's order. */
export const studiedProjects = catalog.studied
export const employmentFeature = {
  title: 'DeliverZero',
  ownership: 'Full-stack engineer, working directly with the CTO',
  outcome: resume.deliverzero_bullets[1],
  href: '/resume/#deliverzero',
}
