// @ts-check
// The project catalog's join. A project is spread over four JSON files (the selection, the product
// studies, the pinned sources and the asset manifest) plus the imported portfolio snapshot.
// assembleCatalog() joins them once and throws when they disagree, so pages read finished projects.
// Plain JavaScript and no imports: the data is passed in, so tests can pass broken data and
// node scripts can call it without a build step. project-presentation.ts applies it to the real files.

/** @typedef {{ src: string, srcSet?: string, alt: string, caption: string, capturedAt?: string }} SourceMedia */
/** @typedef {SourceMedia & { width: number, height: number }} ProjectMedia */
/**
 * A project as the selection and the imported portfolio record it.
 * @typedef {object} SourceProject
 * @property {string} slug
 * @property {string} title
 * @property {string} summary
 * @property {string} description
 * @property {string} problem
 * @property {string} role
 * @property {number} year
 * @property {string} [deliveryStatus]
 * @property {string} [periodLabel]
 * @property {string[]} stack
 * @property {string[]} highlights
 * @property {string[]} architecture
 * @property {string[]} lessons
 * @property {SourceMedia[]} media
 * @property {string | null} [liveUrl]
 * @property {string} [repoUrl]
 * @property {string} [sourceUrl]
 * @property {string} [thumbnailUrl]
 * @property {string} [thumbnailAlt]
 * @property {string} [brandBackground]
 * @property {{ slug: string, label: string, relationship: string }[]} [relatedProjects]
 */
/** @typedef {{ id: string, heading: string, paragraphs: string[], tradeoff: string | null, sources: { label: string, url: string }[] }} StudySection */
/** @typedef {{ slug: string, title: string, description: string, scope: string, outcome: string, intro: string, sections: StudySection[], limits: string }} SourceStudy */
/** @typedef {SourceStudy & { path: string }} Study */
/**
 * A finished project.
 * @typedef {Omit<SourceProject, 'media'> & {
 *   media: ProjectMedia[],
 *   path: string,
 *   current: boolean,
 *   displayName: string,
 *   socialImage: string,
 *   furtherStudies: { href: string, label: string }[],
 *   study?: Study,
 *   evidence?: { repo: string, sha: string, readmeUrl: string },
 * }} Project
 * `media` carries its dimensions from the asset manifest. `current` is true for the selection and
 * false for retained historical pages. `displayName` names the product at `liveUrl`. `evidence` is
 * the pinned source the copy was reviewed against; only current projects have one.
 */
/** @typedef {Project & { study: Study }} StudiedProject */
/**
 * @typedef {object} CatalogInput
 * @property {SourceProject[]} portfolio portfolio.json `projects`
 * @property {SourceProject[]} selected selected-projects.json `projects`
 * @property {SourceStudy[]} studies project-case-studies.json `studies`
 * @property {{ repo: string, sha: string }[]} sources selected-project-sources.json `sources`
 * @property {{ path: string, width: number, height: number }[]} assets project-assets-provenance.json `files`
 * @property {string[]} featured featured slugs, in display order
 */

/** The four projects with a case study, in display order. */
export const featuredSlugs = ['clpr', 'clustr', 'rekolekt', 'undertow']

// Rules that used to be slug branches in the page templates.
/** @type {Record<string, string>} The live product's name where it differs from the project title. */
const displayNames = { rekolekt: 'HasanAra' }
/** @type {Record<string, { href: string, label: string }[]>} Hand-written studies a project page also links. */
const furtherStudies = { clpr: [{ href: '/case-studies/clpr-search/', label: 'Read the search decisions study' }] }
const sharedCard = '/assets/brand/patrick/share-card.png'

/**
 * Join the content files into finished projects. Throws one Error naming every entry that disagrees.
 * @param {CatalogInput} input
 * @returns {{ all: Project[], selected: Project[], featured: StudiedProject[], supporting: Project[], studied: StudiedProject[] }}
 * `all` is every detail page: the portfolio in its own order with current entries overlaid, then
 * new selections. `studied` follows the study file's order.
 */
export function assembleCatalog({ portfolio, selected, studies, sources, assets, featured }) {
  /** @type {string[]} */
  const problems = []
  const current = new Set(selected.map(project => project.slug))
  const dimensions = new Map(assets.map(file => [file.path, file]))
  const studyBySlug = new Map(studies.map(study => [study.slug, study]))

  /** @param {SourceProject} project @returns {Project} */
  const finish = project => {
    const isCurrent = current.has(project.slug)
    const study = isCurrent ? studyBySlug.get(project.slug) : undefined
    const source = isCurrent ? sources.find(item => item.repo.endsWith(`/${project.slug}`)) : undefined
    return {
      ...project,
      media: project.media.map(media => {
        const size = dimensions.get(media.src)
        if (!size) problems.push(`project "${project.slug}": media ${media.src} is not in project-assets-provenance.json`)
        return { ...media, width: size?.width ?? 0, height: size?.height ?? 0 }
      }),
      path: `/projects/${project.slug}/`,
      current: isCurrent,
      displayName: displayNames[project.slug] ?? project.title,
      // Current entries without their own image share the site card; everything else has a rendered card.
      socialImage: isCurrent && !project.thumbnailUrl ? sharedCard : `/assets/projects/social/${project.slug}.png`,
      furtherStudies: furtherStudies[project.slug] ?? [],
      ...(study && { study: { ...study, path: `/case-studies/${study.slug}/` } }),
      ...(source && { evidence: { repo: source.repo, sha: source.sha, readmeUrl: `https://github.com/${source.repo}/blob/${source.sha}/README.md` } }),
    }
  }

  const finished = new Map(selected.map(project => [project.slug, finish(project)]))
  const all = [
    ...portfolio.map(project => finished.get(project.slug) ?? finish(project)),
    ...selected.filter(project => !portfolio.some(old => old.slug === project.slug)).map(project => /** @type {Project} */ (finished.get(project.slug))),
  ]

  for (const study of studies) {
    const project = finished.get(study.slug)
    if (!project) problems.push(`project-case-studies.json: study "${study.slug}" has no project in selected-projects.json`)
    else if (!project.media.length) problems.push(`project-case-studies.json: study "${study.slug}" has no lead image: project "${study.slug}" has no media`)
  }
  for (const slug of featured) {
    if (!current.has(slug)) problems.push(`featured slug "${slug}" is not in selected-projects.json`)
    else if (!studyBySlug.has(slug)) problems.push(`featured slug "${slug}" has no study in project-case-studies.json`)
  }
  if (problems.length) throw new Error(`Project catalog: the content files disagree.\n- ${problems.join('\n- ')}`)

  const pick = (/** @type {string[]} */ slugs) => slugs.map(slug => /** @type {StudiedProject} */ (finished.get(slug)))
  return {
    all,
    selected: [...finished.values()],
    featured: pick(featured),
    supporting: [...finished.values()].filter(project => !featured.includes(project.slug)),
    studied: pick(studies.map(study => study.slug)),
  }
}
