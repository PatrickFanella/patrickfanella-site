# Case-study layout

The sample reads Clpr's `Search` method at commit `1eab1a62535e562e327fbf4b197c094e81abe619`,
`backend/internal/repository/search_repository.go`, lines 26–47. The complete upstream file is
archived in `src/content/case-studies/search_repository.go`; its bytes were compared with the
pinned raw GitHub source. SHA-256: `073e770bbd98884ad051bf7f906776f746fa0a6568c7da62142cbd4b786d10fc`.
It remains GPL-3.0 source, as is this site. Builds read the local copy without fetching source.

`CaseStudy.astro` accepts source text, commit, path, hash and ordered, nonoverlapping note ranges.
Astro's `Code` component applies Shiki highlighting at build time. A transformer adds each original
line number and a link to that exact GitHub line. Source text, including blank lines and indentation,
is preserved. An extra terminating newline compensates for Astro removing one during highlighting.
Underlined ranges have visible linked “Note:” text as well as a separate note with a line range.

Each excerpt and its note form a grid row. Without JavaScript or CSS anchor support the note stays
in flow beside the excerpt; phones place it immediately below that excerpt. When CSS anchors are
available, a small page script first reserves the note's measured height, then positions it beside
the specific first line it explains. Resizing and font loading recalculate that space. This avoids
collisions between notes of different lengths. The code itself scrolls horizontally without making
the page overflow. Fonts, themes, focus styling and ink come from the existing site.

This sample describes initialization, query conversion and type selection visible in the source.
The opinionated ranking/pagination study and Patrick's approval of its claims are issue #22.
Checks: `npm run build`; `npx playwright test e2e/case-study.spec.ts`. The test compares every line,
including blanks, against the archive, validates its full-commit link, and checks placement at
1440 and 390 px. Firefox is checked separately for the normal-flow fallback.
