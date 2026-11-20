# Portfolio catalog

`node scripts/sync-portfolio.mjs` uses authenticated `gh api` to copy the exact catalog bytes from the pinned portfolio
commit (the source repository is private) and records the repository, file, full commit, SHA-256 and project count beside them.
An optional local clone path uses `git show` for the same commit and file, with no checkout mutation.
Builds use the checked-in copy and do not fetch content from the network.

The current `/projects/` selection is maintained separately in `src/content/selected-projects.json`:
four featured projects (Clpr, Clustr, Rekolekt with HasanAra, Undertow) and twelve supporting entries.
Imported selection flags are not used. The source catalog bytes
remain intact; current entries overlay those records for detail pages, and three new projects bring
the total to 43 detail routes. Unselected pages carry a historical-snapshot notice and return to the
Work index. The sitemap lists the current sixteen detail pages.

## The project catalog

`assembleCatalog()` in `src/content/project-catalog.mjs` joins the selection, the product studies,
`selected-project-sources.json`, the asset manifest and the imported portfolio into finished
projects. Each has its media with dimensions, `path`, `current`, `socialImage`, `displayName`
(the live product's name: HasanAra for Rekolekt), `furtherStudies` (Clpr's search study) and, where
they exist, its `study` and pinned source `evidence`. The four featured slugs and those slug rules
live in that module, with the asset path rules `socialCardPath()` and `assetPaths()` (a project's
thumbnail and media files with their `srcSet` candidates). `src/content/projects.mjs` applies the join
to the checked-in files and is the one place that opens them. It is plain JavaScript with JSON import
attributes, so Astro, Vitest, Playwright and plain node scripts import the same `catalog` with no
build step or generated copy. `project-presentation.ts` re-exports it for the pages as
`allProjects`, `selectedProjects`, `featuredProjects`, `supportingProjects` and `studiedProjects`,
with `reviewedOn` and `projectsReply`.
The project and case-study pages, the landing page, the Desk, the sitemap and `ProjectMedia.astro`
read those and do not open the JSON files.

The three hand-maintained files each record `reviewedAt`. The join requires them to agree and gives
`reviewedOn` ("November 16, 2026"), which the Work index, the project pages and the study pages
print in their source notes. Each featured project has a `tagline` in `selected-projects.json`;
`projectsReply` joins the featured projects' product names and taglines for the Desk shell
([desk-shell.md](desk-shell.md)).

The join throws when the files disagree: a study whose slug is not in the selection or whose project
has no image or no `thumbnailUrl` (the study page uses the project's `socialImage`), a media file missing from the asset manifest, a featured slug that is not selected
or has no study or no tagline, or review dates that differ. The message names each entry. Because the pages import the result, this fails
`npm run build`; `src/content/project-catalog.test.ts` fails `npm run test:unit` on the same data
and tests each rule with broken fixture data. `scripts/check-project-paths.mjs` imports the
catalog for its pages, study paths and counts, so it fails on the same disagreements. The two asset
scripts rewrite files the join reads (the asset manifest and the selection), so they read their own
inputs and take only the path rules from `project-catalog.mjs`; a stale manifest cannot stop them.
The e2e specs take project paths, counts and the review date from the catalog; the unit test states
the counts, the featured four, the review date and the shell reply literally.

The four product stories at `/case-studies/<slug>/` read `project-case-studies.json`. Each includes
scope, current delivery status, implementation choices, tradeoffs and evidence limits. Public
implementation links use full reviewed commit IDs recorded in `selected-project-sources.json`.
The existing pinned Clpr request walkthrough is retained at `/case-studies/clpr-request/`, and
its ranking study remains at `/case-studies/clpr-search/`. `/case-studies/` introduces all four stories.

Featured entries show fresh captioned screenshots; supporting entries are compact text rows.
`ProjectMedia.astro` takes dimensions from the catalog, uses responsive WebP variants and
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
and Backline, respectively. Astro static output emits HTML refresh redirects, and those pages are
the only redirects: the deploy files must not add their own, and the check below fails if they do. Project URLs retain their old slug with a trailing slash.

## Routes, redirects and the security policy

`src/content/site-facts.mjs` states the hand-written pages, these redirects and the
Content-Security-Policy once. `astro.config.mjs`, the sitemap, `scripts/lighthouse.mjs`,
`scripts/check-live-routes.mjs`, `scripts/check-project-paths.mjs` and the browser tests read it.
To add a page, add one `{ path }` line to `routes`: it joins the sitemap, the Lighthouse run, the
live-route check and the specs that visit every page type (`crawlRoutes` in `e2e/fixtures.ts`).
A `skip` list on a route keeps it out of the named consumers. Project and case-study pages still
come from the content data.

`deploy/origin.Caddyfile` and `deploy/edge-route.py` are hand-written. `node
scripts/check-site-facts.mjs` runs in `npm run build` and in CI, and fails when either file's policy
differs from the definition or appears more than once (a second header name in the Caddyfile, or a
second `CSP` assignment or `default-src` in the edge script), when either contains a redirect, or when
`deploy/update.py` requires a page that is not a route. The redirect search covers the whole text of
both files for `redir`, `rewrite`, `handle_path`, `uri` rewrites, a `Location` header, a `respond`
with a 3xx status, and the old paths in `redirects`; a redirect written another way is not detected. Intended differences are listed in that script with a reason;
the only one is the edge copy's extra `upgrade-insecure-requests`. The GitHub and LinkedIn links on
the pages and in the Shell come from `src/content/resume.json`.

`node scripts/check-project-paths.mjs` compares built pages against every catalog slug and the
live site's sitemap captured on 2026-11-15 UTC in `docs/evidence/current-site-sitemap.xml`. Use
`--live` to compare with the current public sitemap instead. Only project paths are checked here;
the live contact route belongs to launch work.

Checks: `npm run build`; `npx playwright test e2e/content.spec.ts` checks the curated list without
JavaScript, mobile overflow, and accessibility in both themes.
`npx playwright test e2e/project-pages.spec.ts` checks all detail pages without scripts, images,
metadata, legacy redirects, list navigation, name hand-over and mobile accessibility.
`npx playwright test e2e/portfolio-selection.spec.ts` checks the four product stories without scripts,
pinned source links, mobile accessibility, enlarged text and retained historical pages.
`npm run test:unit` checks the catalog join and which pages the sitemap lists, without a build.

The project hand-over listener runs as a scoped, classic external blocking script in the head, before
the first rendering opportunity. A render expectation points to the footer so the selected
name is parsed before the incoming snapshot. The script is served from this origin to obey
the preview's CSP without allowing inline scripts. This follows Chrome’s cross-document guidance:
https://developer.chrome.com/docs/web-platform/view-transitions/cross-document
The shared page head contains the view-transition opt-in rule before external stylesheets load;
the returning catalog had no active transition at reveal when this rule lived only in CSS files.
The outgoing detail title keeps its name when returning to the catalog. Both event paths
handle the expected ready rejection on skipped transitions and clean up names on completion.
