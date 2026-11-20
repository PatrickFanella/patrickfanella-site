// @ts-check
// Routes, redirects and the security policy, stated once. Plain JavaScript so astro.config.mjs,
// the node scripts, the pages and the browser tests can all import it without a build step.
// deploy/origin.Caddyfile and deploy/edge-route.py stay hand-written; scripts/check-site-facts.mjs
// fails when they drift from this file.

/** @typedef {'lighthouse' | 'live' | 'crawl'} RouteConsumer */

/**
 * The hand-written pages, in sitemap order. Project and case-study pages come from the content
 * data instead. A new page is one line here: it joins the sitemap, the Lighthouse run, the
 * live-route check and the route-crawling specs unless `skip` names one of them.
 * @type {{ path: string, skip?: RouteConsumer[] }[]}
 */
export const routes = [
  { path: '/' },
  { path: '/projects/' },
  { path: '/resume/' },
  { path: '/contact/' },
  { path: '/desk/' },
  // The skips below keep each consumer on the set it visited before the lists were merged (#102).
  { path: '/motion/', skip: ['lighthouse'] },
  { path: '/case-studies/', skip: ['lighthouse', 'live', 'crawl'] },
  { path: '/case-studies/clpr-search/', skip: ['lighthouse'] },
  { path: '/case-studies/clpr-request/', skip: ['lighthouse', 'live', 'crawl'] },
]

/**
 * Every hand-written page, or those one consumer visits.
 * @param {RouteConsumer} [consumer]
 */
export const routePaths = consumer => routes.filter(route => !consumer || !route.skip?.includes(consumer)).map(route => route.path)

/** Old project URLs, kept as static redirect pages. @type {Record<string, string>} */
export const redirects = {
  '/projects/transcript-create': '/projects/rekolekt/',
  '/projects/discord-spywatcher': '/projects/backline/',
}

// patrickfanella.co's production policy, plus 'wasm-unsafe-eval' and worker-src for PostgreSQL on
// the desk. `astro preview` sends it too, so the browser tests fail on any violation.
export const contentSecurityPolicy = "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'"
