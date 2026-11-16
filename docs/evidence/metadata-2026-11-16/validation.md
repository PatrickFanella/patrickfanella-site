# Metadata and favicon validation — November 16, 2026

Base: deployed main `48e0250d5fd002750511e77c5fb105c7c2f99aee`.

- `npm run build`: passed, including Astro and both TypeScript projects. Existing async-function hint remains; no new diagnostics.
- Focused metadata/brand/content/project/header browser run: all 21 checks passed.
- Final metadata/landing/fallback/accessibility/Desk browser run, excluding the unchanged database-worker group: all 22 checks passed.
- Metadata tests traverse every sitemap page without JavaScript, compare canonical and social fields, fetch and decode social PNGs, verify the structured graph and check the manifest/icon hashes. Browser-theme tests cover system preference, a manual override and reload persistence.
- `node scripts/check-project-paths.mjs`: all 43 project detail pages, prior sitemap paths, redirects and four stories exist.
- `node scripts/lighthouse.mjs --local`: all nine mobile budgets passed. SEO, accessibility and best practices scored 100 everywhere; performance scored 100 except Work at 96. Every CLS value is below 0.05. See `lighthouse-summary.json`.
- All seven approved brand originals retain their provenance hashes. Regenerating icons produces the same nine output records/bytes. Pillow independently decoded the ICO and its 16-, 32- and 48-pixel frames.
- `git diff --check`: passed.

These are local built-site results. Hosted PR checks, merge state, deployment and third-party search/social cache refresh are separate states.
