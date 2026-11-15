# Clpr ranking and pagination study

The full study is at `/case-studies/clpr-search/`. It reads lines 174–221 of the same archived
repository file as the layout sample, commit `1eab1a62535e562e327fbf4b197c094e81abe619` from
2026-11-14. Fresh retrieval from the public pinned GitHub source matched the archive’s SHA-256:
`073e770bbd98884ad051bf7f906776f746fa0a6568c7da62142cbd4b786d10fc`.

Each annotation links to its exact source range and explains the implemented choice, the user
need it supports, its tradeoff and the requirements that would justify revisiting it. The four
ranges cover ranking (174–180), the count (182–188), snippets (190–198) and paging (200–221).
No timings or production-backend claims are inferred from these lines. Alternatives are conditional
design choices, not a correction list or claims of work that shipped.

Patrick explicitly approved the rendered study’s claims and voice on 2026-11-15 UTC after
review artifacts were supplied in PR #45. That PR merged into `feat/resume-page` as `de12958`.
The owner then asked for a decision walkthrough explaining why these solutions fit, rather than
wording that reads as a critique of a bad implementation. The follow-up removes the draft labels
and makes that editorial revision. It explains the benefits visible in the implementation without
inventing historical comparisons, benchmarks or a universal “best” algorithm.
The original screenshots in `docs/reviews/` record the version submitted for approval; the
`clpr-search-decisions-*` screenshots show the revised decision walkthrough.

Both study pages use an 88% opaque reading surface in the existing theme color, with a 10 px
backdrop blur, border and responsive padding. It covers the title, notes, source and source
captions while letting a little smoke show through. Browsers without blur keep the translucent
surface; browsers without `color-mix` use the solid theme color. Fonts, motion, square corners
and the rest of the palette stay with the site tokens.

Checks: `npm run build`; `npx playwright test e2e/case-study.spec.ts e2e/clpr-study.spec.ts`.
Chromium and Firefox compare the rendered text with every source line, validate the source pin
and annotation links, read the study without scripts, check note placement at 1440 and 390 px,
and run axe in both themes. Browser output includes full-page screenshots for owner review.
