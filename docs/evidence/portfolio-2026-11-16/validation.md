# Curated portfolio validation — November 16, 2026

The change adds four product case studies and twelve supporting entries. It is based on main
`6e913b089c5043dd61ca947fb8055e51cc0150c4`. These are local results; hosted checks and release state
must be read from the pull request and production revision separately.

- `npm run build`: passed, 56 routes. Astro check reports zero errors or warnings and the existing async-function hint in `src/motion/motion.ts`; bundling retains the existing PGlite eval warnings.
- `npm run typecheck`: passed, including the browser-test TypeScript project.
- `E2E_PORT=4388 npx playwright test --workers=2 --reporter=line`: all 109 tests passed, including Chromium regression coverage and the existing Firefox source-study coverage.
- After the last case-study fact-layout adjustment, `E2E_PORT=4388 npx playwright test e2e/portfolio-selection.spec.ts --workers=2 --reporter=line`: all four tests passed on the final build. These cover the four stories without JavaScript, source pins, mobile accessibility, 200% text and retained historical routes.
- `node scripts/check-project-paths.mjs`: all 43 detail pages, six prior sitemap project paths, two redirects and four new study routes exist.
- `node scripts/lighthouse.mjs --local --paths=/,/projects/,/resume/,/contact/,/desk/,/case-studies/clpr/,/case-studies/clustr/,/case-studies/rekolekt/,/case-studies/undertow/`: all nine mobile budgets passed. The Work page scored 96 for performance; all other pages scored 100. Accessibility, best practices and SEO scored 100 on every page. All CLS values are below 0.05. See `lighthouse-summary.json` for measured values and graphics context. The default CI route set now includes all nine pages.
- All 112 asset-manifest SHA-256 values match the checked-in bytes; all eight original capture hashes match. The twenty current derivatives include sixteen WebPs and four PNG social cards.
- GitHub source readback resolved all seventeen repository/README pins. All twenty unique commit-pinned file links used by the stories resolve at the named commits.
- Shared-browser visual review covered the Work page at desktop width and case-study reading layouts at 1440 and 390 CSS pixels, including light and dark themes. This is browser emulation, not physical-device qualification.
- Independent read-only code and copy reviews completed. Removed unused inherited selection flags/metadata, recorded social-card provenance, and corrected narrow-screen fact labels before finalizing.
- `git diff --check`: passed.

The screenshots show real public application states. Undertow uses an isolated demonstration
project with original synthesized audio and approved portfolio artwork. No signed-in private task
screen or private application data was captured. No new production-performance or audience claim
is inferred from these screenshots or the pinned Desk fixtures.

## Desk delivery-label follow-up

The automated PR review found that the longer delivery statuses inherited a non-wrapping Desk
heading layout. A focused browser regression reproduced 226 pixels of horizontal overflow at
320 CSS pixels before the fix. The heading now wraps its flex items, and status text wraps within
the available width with a readable multiline line height.

- `npm run build`: passed after the CSS change.
- `E2E_PORT=4388 npx playwright test e2e/desk.spec.ts --grep 'project names and delivery|loads without errors|Alt\+3' --workers=2 --reporter=line`: all four checks passed.
- The regression checks the project pane and all four headings at 320, 390, 1100 and 1440 CSS pixels, at both 100% and 200% text, without horizontal overflow. The existing light/dark axe and keyboard-pane checks also pass.
- `node scripts/lighthouse.mjs --local --paths=/desk/`: all budgets passed, with 100 in every category and CLS 0.00187. See `desk-wrap-lighthouse-summary.json`.
