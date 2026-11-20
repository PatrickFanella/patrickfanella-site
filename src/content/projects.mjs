// @ts-check
// The project catalog over the checked-in content files: the one place that opens them. Plain JavaScript
// with JSON import attributes, so Astro, Vitest, Playwright and plain node scripts all import the same
// join without a build step. It throws when the files disagree, which fails the build, the unit tests
// and scripts/check-project-paths.mjs.
import portfolio from './portfolio.json' with { type: 'json' }
import selection from './selected-projects.json' with { type: 'json' }
import studies from './project-case-studies.json' with { type: 'json' }
import sources from './selected-project-sources.json' with { type: 'json' }
import assets from './project-assets-provenance.json' with { type: 'json' }
import { assembleCatalog, featuredSlugs } from './project-catalog.mjs'

export const catalog = assembleCatalog({
  portfolio: portfolio.projects,
  selected: selection.projects,
  studies: studies.studies,
  sources: sources.sources,
  assets: assets.files,
  featured: featuredSlugs,
  reviewedAt: [selection.reviewedAt, studies.reviewedAt, sources.reviewedAt],
})
