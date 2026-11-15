# Clpr ranking and pagination study

The full study is at `/case-studies/clpr-search/`. It reads lines 174–221 of the same archived
repository file as the layout sample, commit `1eab1a62535e562e327fbf4b197c094e81abe619` from
2026-11-14. Fresh retrieval from the public pinned GitHub source matched the archive’s SHA-256:
`073e770bbd98884ad051bf7f906776f746fa0a6568c7da62142cbd4b786d10fc`.

Each annotation links to its exact source range and separates behavior, qualitative cost and
proposed changes. The four ranges cover ranking (174–180), the count (182–188), snippets (190–198)
and paging (200–221). No timings or production-backend claims are inferred from these lines.
The proposed ranking evaluation, optional totals, snippet tests and cursor work are editorial
recommendations for review, not claims that those changes shipped.

Patrick explicitly approved the rendered study’s claims and voice on 2026-11-15 UTC after
review artifacts were supplied in PR #45. That PR merged into `feat/resume-page` as `de12958`.
The approval follow-up removes the draft labels while retaining the distinction between
qualitative costs and measurements, and between proposed changes and shipped behavior.
The screenshots in `docs/reviews/` record the version submitted for that approval.

Checks: `npm run build`; `npx playwright test e2e/case-study.spec.ts e2e/clpr-study.spec.ts`.
Chromium and Firefox compare the rendered text with every source line, validate the source pin
and annotation links, read the study without scripts, check note placement at 1440 and 390 px,
and run axe in both themes. Browser output includes full-page screenshots for owner review.
