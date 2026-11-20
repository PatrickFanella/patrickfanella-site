import resume from './resume.json' with { type: 'json' }
import { catalog } from './projects.mjs'

export type { Project, ProjectMedia, StudiedProject } from './project-catalog.mjs'

// Every detail route: previously published pages stay while the current selection is refreshed.
export const allProjects = catalog.all
export const selectedProjects = catalog.selected
export const featuredProjects = catalog.featured
export const supportingProjects = catalog.supporting
/** The projects with a product case study, in the study file's order. */
export const studiedProjects = catalog.studied
/** The date the selection's copy was reviewed against its sources, as the pages print it. */
export const reviewedOn = catalog.reviewedOn
/** The same for the product studies, which are reviewed in their own file. */
export const studiesReviewedOn = catalog.studiesReviewedOn
/** The Desk shell's `projects` reply: each featured project by its product name. */
export const projectsReply = featuredProjects.map(project => `${project.displayName}: ${project.tagline}.`).join(' ')
export const employmentFeature = {
  title: 'DeliverZero',
  ownership: 'Full-stack engineer, working directly with the CTO',
  outcome: resume.deliverzero_bullets[1],
  href: '/resume/#deliverzero',
}
