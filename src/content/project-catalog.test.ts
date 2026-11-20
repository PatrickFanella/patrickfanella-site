import { expect, test } from 'vitest'
import { assembleCatalog, type SourceProject } from './project-catalog.mjs'
import { allProjects, featuredProjects, selectedProjects, studiedProjects, supportingProjects } from './project-presentation'
import { GET } from '../pages/sitemap.xml'

// Literal fixture data, so the join's rules are tested whatever the content files hold.
const project = (slug: string, extra: Partial<SourceProject> = {}): SourceProject => ({
  slug, title: slug.toUpperCase(), summary: '', description: '', problem: '', role: '', year: 2026,
  stack: [], highlights: [], architecture: [], lessons: [], media: [], ...extra,
})
const shot = { src: '/assets/a.webp', srcSet: '/assets/a-640.webp 640w', alt: 'A', caption: 'Shot A' }
const study = (slug: string) => ({ slug, title: 'Study', description: 'About', scope: '', outcome: '', intro: '', sections: [], limits: '' })
const fixture = () => ({
  portfolio: [project('old'), project('alpha', { title: 'Stale title' })],
  selected: [project('alpha', { media: [shot], thumbnailUrl: '/assets/a.webp' }), project('beta'), project('rekolekt'), project('clpr')],
  studies: [study('alpha')],
  sources: [{ repo: 'org/alpha', sha: 'abc123' }, { repo: 'org/old', sha: 'def456' }, { repo: 'org/not-alpha', sha: 'fff' }],
  assets: [{ path: '/assets/a.webp', width: 1280, height: 800 }],
  featured: ['alpha'],
})

test('each project is joined once with its study, source, media dimensions, social card and display name', () => {
  const catalog = assembleCatalog(fixture())
  // Portfolio order with current entries overlaid, then new selections.
  expect(catalog.all.map(item => [item.slug, item.title, item.current])).toEqual([
    ['old', 'OLD', false], ['alpha', 'ALPHA', true], ['beta', 'BETA', true], ['rekolekt', 'REKOLEKT', true], ['clpr', 'CLPR', true],
  ])
  expect(catalog.selected.map(item => item.slug)).toEqual(['alpha', 'beta', 'rekolekt', 'clpr'])
  expect(catalog.featured.map(item => item.slug)).toEqual(['alpha'])
  expect(catalog.supporting.map(item => item.slug)).toEqual(['beta', 'rekolekt', 'clpr'])
  expect(catalog.studied).toEqual(catalog.featured)

  const [old, alpha, beta, rekolekt, clpr] = catalog.all
  expect(alpha).toBe(catalog.selected[0])
  expect(alpha.path).toBe('/projects/alpha/')
  expect(alpha.media).toEqual([{ ...shot, width: 1280, height: 800 }])
  expect(alpha.study).toEqual({ ...study('alpha'), path: '/case-studies/alpha/' })
  expect(alpha.evidence).toEqual({ repo: 'org/alpha', sha: 'abc123', readmeUrl: 'https://github.com/org/alpha/blob/abc123/README.md' })
  expect(alpha.socialImage).toBe('/assets/projects/social/alpha.png')
  expect(alpha.displayName).toBe('ALPHA')
  expect(alpha.furtherStudies).toEqual([])
  // A current entry without its own image shares the site card.
  expect(beta.socialImage).toBe('/assets/brand/patrick/share-card.png')
  expect(beta.study).toBeUndefined()
  expect(beta.evidence).toBeUndefined()
  // A historical entry keeps its rendered card and takes no pinned source, even when one matches its slug.
  expect(old.socialImage).toBe('/assets/projects/social/old.png')
  expect(old.evidence).toBeUndefined()
  // The slug rules the page templates used to branch on.
  expect(rekolekt.displayName).toBe('HasanAra')
  expect(clpr.furtherStudies).toEqual([{ href: '/case-studies/clpr-search/', label: 'Read the search decisions study' }])
})

test('a study without a project fails and names the study', () => {
  const data = fixture()
  data.studies.push(study('ghost'))
  expect(() => assembleCatalog(data)).toThrow('project-case-studies.json: study "ghost" has no project in selected-projects.json')
  // A project that is only in the historical portfolio does not count.
  data.studies[1] = study('old')
  expect(() => assembleCatalog(data)).toThrow('study "old" has no project in selected-projects.json')
})

test('a project without its assets fails and names the project and the file', () => {
  const data = fixture()
  data.assets = []
  expect(() => assembleCatalog(data)).toThrow('project "alpha": media /assets/a.webp is not in project-assets-provenance.json')
  // Historical pages render their media too.
  const historical = fixture()
  historical.portfolio[0] = project('old', { media: [{ ...shot, src: '/assets/gone.webp' }] })
  expect(() => assembleCatalog(historical)).toThrow('project "old": media /assets/gone.webp is not in project-assets-provenance.json')
})

test('a featured slug that is not selected, or has no study, fails and names the slug', () => {
  expect(() => assembleCatalog({ ...fixture(), featured: ['alpha', 'old'] })).toThrow('featured slug "old" is not in selected-projects.json')
  expect(() => assembleCatalog({ ...fixture(), featured: ['alpha', 'beta'] })).toThrow('featured slug "beta" has no study in project-case-studies.json')
})

test('a studied project needs a lead image, and every disagreement is reported together', () => {
  const data = fixture()
  data.selected[0] = project('alpha')
  data.studies.push(study('ghost'))
  const message = (() => { try { assembleCatalog(data) } catch (error) { return (error as Error).message } })()
  expect(message).toBe([
    'Project catalog: the content files disagree.',
    '- project-case-studies.json: study "alpha" has no lead image: project "alpha" has no media',
    '- project-case-studies.json: study "ghost" has no project in selected-projects.json',
  ].join('\n'))
})

test('a studied project needs its own social card, so its study page never takes the site card', () => {
  const data = fixture()
  data.selected[0] = project('alpha', { media: [shot] })
  expect(() => assembleCatalog(data)).toThrow('project-case-studies.json: study "alpha" has no social card: project "alpha" has no thumbnailUrl')
})

// The real content files: importing project-presentation runs the join, so a disagreement fails this file.
test('the content files agree and give four studied projects, twelve others and 43 detail pages', () => {
  expect(featuredProjects.map(item => item.title)).toEqual(['Clpr', 'Clustr', 'Rekolekt + HasanAra', 'Undertow'])
  expect(studiedProjects.map(item => item.study.path)).toEqual(['/case-studies/clpr/', '/case-studies/clustr/', '/case-studies/rekolekt/', '/case-studies/undertow/'])
  expect(featuredProjects.map(item => item.displayName)).toEqual(['Clpr', 'Clustr', 'HasanAra', 'Undertow'])
  expect(studiedProjects.map(item => item.socialImage)).toEqual([
    '/assets/projects/social/clpr.png', '/assets/projects/social/clustr.png', '/assets/projects/social/rekolekt.png', '/assets/projects/social/undertow.png',
  ])
  expect(supportingProjects).toHaveLength(12)
  expect(selectedProjects).toHaveLength(16)
  expect(allProjects).toHaveLength(43)
  expect(allProjects.filter(item => !item.current)).toHaveLength(27)
  expect(featuredProjects.every(item => item.media.length === 2 && item.media.every(media => media.width > 0 && media.height > 0))).toBe(true)
})

test('the sitemap lists the four studies and the sixteen current projects, and no historical page', async () => {
  const xml = await GET().text()
  const paths = [...xml.matchAll(/<loc>https:\/\/patrickfanella\.co([^<]+)<\/loc>/g)].map(([, path]) => path)
  expect(paths.filter(path => /^\/case-studies\/(clpr|clustr|rekolekt|undertow)\/$/.test(path))).toEqual([
    '/case-studies/clpr/', '/case-studies/clustr/', '/case-studies/rekolekt/', '/case-studies/undertow/',
  ])
  expect(paths.filter(path => /^\/projects\/./.test(path))).toHaveLength(16)
  expect(paths).toContain('/projects/pult/')
  expect(paths).toContain('/projects/stupen/')
  expect(paths).not.toContain('/projects/blacktower/')
  expect(paths).not.toContain('/projects/subcorp/')
  // Each studied project lists its two screenshots under its study and again under its project page.
  expect(xml.match(/<image:loc>/g)).toHaveLength(16)
})
