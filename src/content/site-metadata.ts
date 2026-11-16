import resume from './resume.json' with { type: 'json' }
import icons from './site-icons.json' with { type: 'json' }

export const siteMetadata = {
  name: resume.name,
  origin: resume.website,
  title: 'Patrick Fanella | Senior Backend & Full-Stack Engineer',
  description: 'Senior backend and full-stack engineer in Chicago. Go, Python, TypeScript and PostgreSQL. Explore four engineering case studies, projects and résumé.',
  socialAlt: 'Patrick Fanella. Software, sound, culture. Ink in Motion identity.',
  lightColor: '#e9eff2',
  darkColor: '#10131e',
}

export function iconHref(path: string) {
  const file = icons.files.find(file => file.path === path)!
  return `${path}?v=${file.sha256.slice(0, 12)}`
}

export function structuredMetadata(canonical: string, title: string, description: string) {
  const home = new URL('/', siteMetadata.origin).href
  const person = `${home}#person`
  const website = `${home}#website`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Person', '@id': person, name: resume.name, url: home,
        jobTitle: resume.headline, sameAs: [resume.github, resume.linkedin] },
      { '@type': 'WebSite', '@id': website, name: resume.name, url: home,
        inLanguage: 'en-US', publisher: { '@id': person } },
      { '@type': canonical === home ? 'ProfilePage' : 'WebPage', '@id': `${canonical}#webpage`,
        url: canonical, name: title, description, inLanguage: 'en-US', isPartOf: { '@id': website },
        ...(canonical === home ? { mainEntity: { '@id': person } } : {}) },
    ],
  }
}
