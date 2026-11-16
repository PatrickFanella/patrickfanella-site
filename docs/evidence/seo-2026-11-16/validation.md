# SEO validation — November 16, 2026

This extends metadata PR #93, based on its previously qualified head
`f0869b60218016ab40b02684d8728fd0328014f6`.

- `npm run build`: passed, including Astro and both TypeScript projects; zero errors/warnings and the existing async-function hint.
- `node scripts/check-project-paths.mjs`: all 43 detail pages, legacy sitemap project paths, two redirects and four product studies exist.
- The focused 24-check browser run passed 23 checks; its new sitemap test initially rejected the static server's valid `text/xml` content type. After accepting both valid XML MIME types, all five SEO tests passed. The nineteen accompanying metadata/project/content regression checks passed in that initial run; no application code changed for the MIME correction.
- SEO tests parse the namespaced sitemap, resolve every listed page and image, compare canonical and robots directives, check all 27 historical detail pages, match Article/BreadcrumbList data to visible content without scripts, and check mobile/200% text and axe in both themes.
- `node scripts/lighthouse.mjs --local`: all nine mobile budgets pass, with SEO/accessibility/best-practices at 100 everywhere. Performance is 100 except Work at 96; all CLS values are below 0.05. See `lighthouse-summary.json`.
- Independent read-only SEO-semantics and regression reviews completed with no actionable findings.
- `git diff --check`: passed.

The existing robots.txt allows crawling, so crawlers can read historical pages' noindex metadata.
Structured article dates are omitted rather than inferred from build or screenshot timestamps.
These are local built-site results; hosted checks, publication, search indexing and rich-result
appearance remain separate claims.
