# Portfolio catalog

`node scripts/sync-portfolio.mjs` uses authenticated `gh api` to copy the exact catalog bytes from the pinned portfolio
commit (the source repository is private) and records the repository, file, full commit, SHA-256 and project count beside them.
An optional local clone path uses `git show` for the same commit and file, with no checkout mutation.
Builds use the checked-in copy and do not fetch content from the network.

The current `/projects/` selection is maintained separately in `src/content/selected-projects.json`:
four featured projects (Clpr, Clustr, Rekolekt with HasanAra, Undertow) and twelve supporting entries.
`project-presentation.ts` defines the four featured slugs and exports the same selection for the
landing page, Work page and Desk. Imported selection flags are not used. The source catalog bytes
remain intact; current entries overlay those records for detail pages, and three new projects bring
the total to 43 detail routes. Unselected pages carry a historical-snapshot notice and return to the
Work index. The sitemap lists the current sixteen detail pages.

The four product stories at `/case-studies/<slug>/` read `project-case-studies.json`. Each includes
scope, current delivery status, implementation choices, tradeoffs and evidence limits. Public
implementation links use full reviewed commit IDs recorded in `selected-project-sources.json`.
The existing pinned Clpr request walkthrough is retained at `/case-studies/clpr-request/`, and
its ranking study remains at `/case-studies/clpr-search/`. `/case-studies/` introduces all four stories.

Featured entries show fresh captioned screenshots; supporting entries are compact text rows.
`ProjectMedia.astro` reads dimensions from the asset manifest, uses responsive WebP variants and
native lazy loading, and retains the supplied caption. Case studies and detail pages load their
lead image eagerly and remaining media lazily. Historical entries keep their original image captions;
the page's source note identifies the November 13 imported snapshot. CSS and fonts load without
JavaScript; optional scripts supply ink, theme switching and motion. List links and detail headings
share the project name during the native hand-over. Reduced motion disables that transition, and
browsers without cross-document transitions follow ordinary HTML links.

`node scripts/sync-project-assets.mjs [local-clone]` refreshes the pinned imported assets and their
social cards, then reapplies the site-owned captures. `scripts/process-project-captures.mjs` verifies
the eight original PNG hashes in `docs/evidence/portfolio-2026-11-16/captures.json`, generates two
responsive WebP sizes per capture, updates the featured media, and renders four 1200 × 630 PNG social
cards. The manifest records each derivative's source capture, dimensions and SHA-256. Capture notes
distinguish public data from the isolated Undertow demonstration. The pages load no external images
or fonts. Running the capture processor does not need a login or another browser session.

The old `/projects/transcript-create` and `/projects/discord-spywatcher` URLs redirect to Rekolekt
and Backline, respectively. Astro static output emits HTML refresh redirects; the launch server
can supply HTTP redirects for the same mapping. Project URLs retain their old slug with a trailing slash.

`node scripts/check-project-paths.mjs` compares built pages against every catalog slug and the
live site's sitemap captured on 2026-11-15 UTC in `docs/evidence/current-site-sitemap.xml`. Use
`--live` to compare with the current public sitemap instead. Only project paths are checked here;
the live contact route belongs to launch work.

Checks: `npm run build`; `npx playwright test e2e/content.spec.ts` checks the curated list without
JavaScript, mobile overflow, and accessibility in both themes.
`npx playwright test e2e/project-pages.spec.ts` checks all detail pages without scripts, images,
metadata, legacy redirects, list navigation, name hand-over and mobile accessibility.
`npx playwright test e2e/portfolio-selection.spec.ts` checks the four product stories without scripts,
pinned source links, mobile accessibility, enlarged text and curated sitemap discovery.

The project hand-over listener runs as a scoped, classic external blocking script in the head, before
the first rendering opportunity. A render expectation points to the footer so the selected
name is parsed before the incoming snapshot. The script is served from this origin to obey
the preview's CSP without allowing inline scripts. This follows Chrome’s cross-document guidance:
https://developer.chrome.com/docs/web-platform/view-transitions/cross-document
The shared page head contains the view-transition opt-in rule before external stylesheets load;
the returning catalog had no active transition at reveal when this rule lived only in CSS files.
The outgoing detail title keeps its name when returning to the catalog. Both event paths
handle the expected ready rejection on skipped transitions and clean up names on completion.
