# Concept round 2: "Run it here, with receipts"

Read context-r1.md first. This file supersedes concept-r1.md.

## Verified since round 1 (spike 3, 2026-11-13, on Clpr GitHub main `aa41764`, 2026-11-12)

Earlier spikes ran on a stale local checkout (`1f805dbf`, 2026-10-03). Spike 3 re-ran
everything on a fresh clone of current main:
- All 155 up migrations apply to PGlite (pgvector, pg_trgm, ltree, pgcrypto) after
  `create role clpr`.
- Inputs that returned 500 on the stale code (`rock & roll`, `foo(bar`, `!`, `world:record`,
  `c++`) return 200 on main; production clpr.tv also returns 200 for all five. Missing `q`
  returns Clpr's 400; a malformed escape returns 400; a recover() wrapper keeps one bad request
  from killing the instance.
- Fault control works: a failing OpenSearch provider passed to the real
  `NewSearchHandlerWithOpenSearchProvider` makes the real handler log "OpenSearch error, falling
  back to PostgreSQL" and set `X-Search-Failover: true`, reason `error`, service `opensearch`.
  Adds no bytes. Production does not configure OpenSearch, so this branch has never fired in
  production; the control says so.
- `TrackSearch` writes a row to `search_queries` for every search.
- Two real behaviours worth a tradeoff note: `q=!` cleans to an empty query and matches
  everything (127 results across types on the fixture); `c++` becomes prefix `c:*`.
- Browser worker: Go wasm + PGlite in a dedicated module Web Worker in headless Chromium
  (real time, localhost): PGlite 1.4 s, migrations done 2.4 s, Go ready 2.7 s, all requests
  correct including the fault control. Excludes download time.
- Memory: Chromium's total RSS grew by ~495 MB with the demo running (renderer with worker
  582 MB). The in-page memory API reported 96 MB and is not trusted.
- Size on current main: Go wasm 11.6 MB gzip with today's package layout, plus PGlite ~5 MB.
- Production runs the plain Postgres FTS constructor (startup log 2026-11-13 02:00 UTC).
  Why OpenSearch/hybrid is not configured in production is a question for the owner.
- Not verified: service-worker fetch routing (now optional, see Runtime); OTel in-memory
  exporter under wasm.

## Principle for every screen

One primary thing per screen; receipts one disclosure down. Every claim names its source and
date. Divergences from production are listed, not hidden.

## Home (first 30 seconds, no heavy download, no motion)

1. Name, role, one-sentence claim.
2. Three dated, real facts as plain text, e.g. Clpr's release count and migration count from
   its repository at the pinned commit, and the measured SLO result from the latest external
   probe snapshot (window, sample count).
3. A recorded run, as static HTML generated in CI from the pinned wasm build: one real request
   to Clpr's search, its status and top results, one EXPLAIN (ANALYZE) line, the commit. Beside
   it a still SVG of the search path, generated from a checked-in description; the build fails
   if the description's live path disagrees with the constructor production selects at the
   pinned commit. A link: "Run it live" to the demo page.
4. One link to the postmortem, by its outcome.

## Demo page (its own URL, linkable from a resume)

- Launch state: the recorded run, complete (requests, SQL, plan, trace, response), static.
- Live mode: explicit button stating download size and measured memory. Phones, Save-Data and
  low-memory devices stay on the recorded run unless the visitor insists. Nothing is
  prefetched.
- Code: Clpr's production search constructor, Gin route and repository at a pinned commit.
  The wasm artifact is built by Clpr's own CI as a release asset that the portfolio pins.
  Prerequisite: a Clpr refactor moving search (handler, request models, repository) into a
  package that does not import the rest of the app, which production also imports. CI budgets:
  Go wasm <= 6 MB gzip, peak memory measured in headless Chromium. If the refactor stalls, the
  live mode stays off and the recorded run ships.
- Data: CI applies the pinned commit's migrations to PGlite and publishes the migration log as
  a receipt; the tab applies the same SQL (70 KB gzip, ~1 s). The fixture is labeled with row
  counts. The tab shows the plan the fixture actually gets; beside it a CI EXPLAIN (ANALYZE) on
  a larger generated dataset, labeled.
- Runtime: Go wasm and PGlite in a dedicated Web Worker; the page talks to it by direct
  message passing. A service worker for ordinary fetch is optional, demo-path scoped, and only
  after it passes in Chrome, Firefox and Safari.
- Inputs: the handler's real query parameters only. Scripted edge cases: missing `q` (400),
  limit clamp on a valid query, the `q=!` empty-query behaviour, the fault control (labeled
  "never fired in production; production is configured Postgres-only"), and the `TrackSearch`
  write (stays in your tab).
- Inspector, default view: results, one plan line, commit. One disclosure down: request and
  response headers, SQL pgx sent, full plan, trace waterfall (otelgin/otelpgx with an
  in-memory exporter written for the demo, "timings from your browser"), the write. Each panel
  carries a short tradeoff note (e.g. COUNT(*) before the ranked select, OFFSET pagination,
  ts_rank on every match) with a link to the exact lines at the pinned commit.
- Divergences listed on the page: no auth, no production middleware (rate limiting and
  everything in front of the API drawn on the diagram as "not in this demo"), MaxConns=1,
  demo-only exporter, fixture data, pinned commit vs deployed release.
- Production beside it: dated production row counts for the searched tables and this route's
  latency (window, sample count), and a copyable `curl` for the same query against clpr.tv.
- CI gates: fuzzed `q` never returns 5xx; recorded run regenerated each build; scheduled check
  flags when production is ahead of the pin and changes the caption to "pinned <sha>, deployed
  <date>".

## Postmortem (one at launch)

Chosen by the owner from events with contemporaneous artifacts. A written rule fixes the level
of abstraction that may be published (no topology, hosts, addresses or paths); owner review of
the rendered page is the first check, the build-time allowlist sanitizer the second. Logged
facts and later judgment in separate panels; frozen data; native range input plus a button
per marker; the decision log is the no-JS content; every chart has a data table.

## Operating Clpr

On the Clpr case study: SLO definitions; the dated external probe snapshot scored against the
SLO (met or missed, window, sample count), linked to the postmortem if the window includes it;
release history from release notes.

## The rest

Static site (Astro or similar), 25 project pages, resume, contact, colophon. One-line build
provenance footer with a copyable verify command.

## Gates and fallbacks

| Item | Gate | Fallback |
|---|---|---|
| Live demo | wasm <= 6 MB gzip, memory budget, CI requests pass | recorded run only |
| Trace panel | in-memory exporter works under wasm | recorded trace |
| Service worker | passes Chrome, Firefox, Safari | direct worker messaging (default) |
| Postmortem scrubber | keyboard and no-JS checks pass | static annotated timeline |
