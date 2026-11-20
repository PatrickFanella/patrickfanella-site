import resume from './resume.json' with { type: 'json' }
import icons from './site-icons.json' with { type: 'json' }
import { NumberWord } from './number-words.mjs'
import { catalog } from './projects.mjs'

export const siteMetadata = {
  name: resume.name,
  origin: resume.website,
  title: 'Patrick Fanella | Senior Backend & Full-Stack Engineer',
  description: `Senior backend and full-stack engineer. Go, Python, TypeScript and PostgreSQL. ${NumberWord(catalog.studied.length)} engineering case studies, projects and résumé. Chicago or remote.`,
  socialAlt: 'Patrick Fanella. Software, sound, culture. Ink in Motion identity.',
  lightColor: '#e9eff2',
  darkColor: '#10131e',
}

export function iconHref(path: string) {
  const file = icons.files.find(file => file.path === path)!
  return `${path}?v=${file.sha256.slice(0, 12)}`
}

export interface Breadcrumb { name: string; href: string }
export interface ArticleMetadata { headline: string; image: string }
export interface PageSeo { breadcrumbs?: Breadcrumb[]; article?: ArticleMetadata }

export function structuredMetadata(canonical: string, title: string, description: string, { breadcrumbs = [], article }: PageSeo = {}) {
  const home = new URL('/', siteMetadata.origin).href
  const person = `${home}#person`
  const website = `${home}#website`
  const pageId = `${canonical}#webpage`
  const breadcrumbId = `${canonical}#breadcrumbs`
  const articleId = `${canonical}#article`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Person', '@id': person, name: resume.name, url: home,
        jobTitle: resume.headline, sameAs: [resume.github, resume.linkedin] },
      { '@type': 'WebSite', '@id': website, name: resume.name, url: home,
        inLanguage: 'en-US', publisher: { '@id': person } },
      { '@type': canonical === home ? 'ProfilePage' : 'WebPage', '@id': pageId,
        url: canonical, name: title, description, inLanguage: 'en-US', isPartOf: { '@id': website },
        ...(canonical === home ? { mainEntity: { '@id': person } } : article ? { mainEntity: { '@id': articleId } } : {}),
        ...(breadcrumbs.length > 1 ? { breadcrumb: { '@id': breadcrumbId } } : {}) },
      ...(breadcrumbs.length > 1 ? [{ '@type': 'BreadcrumbList', '@id': breadcrumbId,
        itemListElement: breadcrumbs.map((item, index) => ({ '@type': 'ListItem', position: index + 1,
          name: item.name, item: new URL(item.href, home).href })) }] : []),
      ...(article ? [{ '@type': 'Article', '@id': articleId, headline: article.headline, description,
        image: new URL(article.image, home).href, inLanguage: 'en-US',
        author: { '@id': person }, publisher: { '@id': person }, mainEntityOfPage: { '@id': pageId } }] : []),
    ],
  }
}
