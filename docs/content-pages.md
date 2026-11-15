# Portfolio catalog

`node scripts/sync-portfolio.mjs` uses authenticated `gh api` to copy the exact catalog bytes from the pinned portfolio
commit (the source repository is private) and records the repository, file, full commit, SHA-256 and project count beside them.
An optional local clone path uses `git show` for the same commit and file, with no checkout mutation.
Builds use the checked-in copy and do not fetch content from the network.

The 40 catalog entries appear at `/projects/`: selected work first, then earlier work and experiments.
Every entry includes its original summary, stack and delivery status. Missing status is explicitly
unstated, not inferred from screenshots or links. Pre-alpha and development labels are retained.
CSS and fonts load without JavaScript. The optional script supplies ink, theme switching and motion.
Every catalog entry also has a detail page at `/projects/<slug>/`, with its description, links,
stack, status, notes and captioned images. The source catalog remains unchanged. List links and
page headings share the selected project name during the native hand-over; reduced motion disables
the transition. Browsers without cross-document transitions follow ordinary HTML links.

`node scripts/sync-project-assets.mjs [local-clone]` reads only the assets used by this catalog from
the same pinned commit. File hashes are recorded in `project-assets-provenance.json`. It also makes
1200 × 630 PNG social images from each original thumbnail. The pages load no external images or fonts.

The old `/projects/transcript-create` and `/projects/discord-spywatcher` URLs redirect to Rekolekt
and Backline, respectively. Astro static output emits HTML refresh redirects; the launch server
can supply HTTP redirects for the same mapping. Project URLs retain their old slug with a trailing slash.

`node scripts/check-project-paths.mjs` compares built pages against every catalog slug and the
live site's sitemap captured on 2026-11-15 UTC in `docs/evidence/current-site-sitemap.xml`. Use
`--live` to compare with the current public sitemap instead. Only project paths are checked here;
the live contact route belongs to launch work.

Checks: `npm run build`; `npx playwright test e2e/content.spec.ts` checks every source record without
JavaScript, mobile overflow, and accessibility in both themes.
`npx playwright test e2e/project-pages.spec.ts` checks all detail pages without scripts, images,
metadata, legacy redirects, list navigation, name hand-over and mobile accessibility.

The project hand-over listener runs as a scoped, classic external blocking script in the head, before
the first rendering opportunity. A render expectation points to the footer so the selected
name is parsed before the incoming snapshot. The script is served from this origin to obey
the preview's CSP without allowing inline scripts. This follows Chrome’s cross-document guidance:
https://developer.chrome.com/docs/web-platform/view-transitions/cross-document
The shared page head contains the view-transition opt-in rule before external stylesheets load;
the returning catalog had no active transition at reveal when this rule lived only in CSS files.
The outgoing detail title keeps its name when returning to the catalog. Both event paths
handle the expected ready rejection on skipped transitions and clean up names on completion.
