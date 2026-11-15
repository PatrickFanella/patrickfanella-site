# Portfolio catalog

`node scripts/sync-portfolio.mjs` uses authenticated `gh api` to copy the exact catalog bytes from the pinned portfolio
commit (the source repository is private) and records the repository, file, full commit, SHA-256 and project count beside them.
An optional local clone path uses `git show` for the same commit and file, with no checkout mutation.
Builds use the checked-in copy and do not fetch content from the network.

The 40 catalog entries appear at `/projects/`: selected work first, then earlier work and experiments.
Every entry includes its original summary, stack and delivery status. Missing status is explicitly
unstated, not inferred from screenshots or links. Pre-alpha and development labels are retained.
CSS and fonts load without JavaScript. The optional script supplies ink, theme switching and motion.
Individual project pages (#17) remain a separate issue.

Checks: `npm run build`; `npx playwright test e2e/content.spec.ts` checks every source record without
JavaScript, mobile overflow, and accessibility in both themes.
