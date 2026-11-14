# Technical portfolio rebuild: design

> **Read this first (2026-11-14).** Copied from `subculture-collective/patrickfanella-co` when the
> rebuild moved to its own repository. The Clpr demo sections (what the spikes proved, the demo
> architecture, gates and the owner's decisions) still describe the plan. These parts were
> replaced by later owner direction and no longer apply:
>
> - **Visual system and motion.** The owner turned down the plain IBM Plex look. The site now uses
>   a live ink simulation, Big Shoulders Display, Hanken Grotesk and Martian Mono, light and dark
>   themes, and the motion set described in the README. "No motion on load" and the WebGL
>   non-goal are out.
> - **Astro.** What exists is Vite with plain TypeScript. Whether content pages move to Astro is
>   the first spike on the roadmap.
> - **Rollout.** This repository is separate from the live site, so nothing here deploys until the
>   launch issue. The current plan is [docs/plan.md](../plan.md).

Date: 2026-11-14. Status: draft for owner approval. Evidence and the throwaway prototype are in
[../prototypes/clpr-demo-2026-11-14/](../prototypes/clpr-demo-2026-11-14/README.md).

## Intent

Patrick is interviewing for senior backend and full-stack roles. The current site describes the
work; the rebuild should demonstrate it. The owner asked for a portfolio at least as technically
ambitious as his WebGL art site onnwee.me, but calm and professional rather than chaotic. The
stack was left entirely to the builder.

The thesis that survived evaluation: **run the real backend in the visitor's browser and show the
receipts.** Clpr's production Go search code, compiled to WebAssembly, answers requests against
PostgreSQL compiled to WebAssembly, and the page shows every SQL statement, protocol message,
timing and query plan. Around it: a fast, plain portfolio, and one honest engineering write-up.

Readers are hiring managers, staff engineers and recruiters, usually for 30 seconds to 5 minutes,
mostly on laptops, sometimes on phones.

## Goals

- A 30-second reader sees role, availability, résumé, contact, one business outcome and visible
  evidence of backend engineering on the first screen, without clicking anything.
- A 5-minute technical reader can inspect real Clpr code at a pinned commit: request, response,
  SQL, wire messages, timings and plans, and run it live on a desktop browser.
- Every claim names its source and date. Divergences from production are listed, not hidden.
- The site stays fast and accessible: the existing Lighthouse budgets hold (mobile performance
  ≥ 0.9, accessibility, best practices and SEO ≥ 0.95, CLS ≤ 0.05), WCAG AA, keyboard-complete,
  reduced motion honored, all recorded evidence readable without JavaScript.

## Non-goals

- A WebGL or WebGPU visual showcase. The panels judged visual spectacle the weakest hiring signal
  for a backend engineer; the request-path diagram is the visual motif.
- Live production telemetry or a public status page for the portfolio itself.
- Changing which projects are listed (the existing selection in `db/seed/portfolio.json` stays).

## Anti-goals (failure even if it works)

- Any invented number, simulated traffic presented as real, or a demo that differs from
  production without saying how.
- Exposing homelab internals: hostnames, addresses, paths or topology.
- A live demo that a phone downloads by accident, or that blocks the page from rendering.
- Generic portfolio styling: see the visual system below and the style-web-ui banned defaults.

## How we got here

Research (2026-11-13): the WebGPU portfolios that win awards belong to motion designers and
studios; competing on visuals alone loses. What an engineer can show that they can't is working
engineering. PGlite (PostgreSQL in WebAssembly) is mature (v0.5, millions of weekly downloads).
WebGPU still lacks Firefox on Linux.

Five concepts were scored by a panel (Claude Opus 5.5, GPT-6.1 Sol, Gemini 4 Hydrogen):

| Concept | Mean | Notes |
|---|---|---|
| A. Living architecture (GPU diagram of each system) | 6.7 | Pretty, but graphics skill, not backend skill |
| **B. Run it here (real backend in the browser)** | **7.7** | Highest technical depth; feasibility was the doubt |
| C. The site observes itself (traces, SLOs, provenance) | 7.3 | Senior, but a near-zero-traffic site has little to trace |
| D. Atlas (git history as a map) | 5.3 | Data art; commit volume says little |
| E. Postmortems you can scrub | 7.3 | Strongest judgment signal; needs real incidents |

A second panel (Grok 4.7, Kimi K3, Claude Fable 5.2) compared the combinations B+E and B+C;
B+E won. Three feasibility spikes then proved B (below), and four rounds of scoring a clickable
prototype took it from 7.2 to 8.1 (mean of the three judges; current site 6.2, onnwee.me 7.3 on
the same panel). The climb stopped at a plateau: the remaining findings are build features,
infrastructure and owner decisions, all listed in this document.

## What the spikes proved

Throwaway spikes on 2026-11-13/14, against Clpr GitHub `main` at `aa41764`:

- **Unchanged pgx talks to PGlite** through a ~40-line `net.Conn` that hands wire-protocol bytes
  to `execProtocolRaw`. Extended protocol, parameters, full-text ranking and transactions work.
- **Clpr's real code runs in `js/wasm`**: the Gin route, the production `NewSearchHandler`, and
  `SearchRepository` over `pgxpool` (`MaxConns=1`). All 155 up migrations apply to PGlite
  (pgvector, pg_trgm, ltree, pgcrypto) in about 1 s after `create role clpr`; the SQL is 70 KB
  gzip. `TrackSearch` writes work.
- **It runs in a dedicated Web Worker in Chromium**: PGlite 1.3 s, migrations 1.0 s, Go 0.26 s,
  excluding download.
- **Cost today**: Go wasm 9.3 MB gzip with `-tags nomsgpack` (11.6 MB without), plus PGlite about
  5 MB. A minimal Gin + pgx program is 4.6 MB gzip, so a 6 MB budget is reachable only after
  splitting Clpr's search into its own package. Chromium memory grows by about 495 MB.
- **Real findings the demo can show**: the planner uses a sequential scan up to 30,008 rows and
  the GIN index `idx_clips_search_vector` at 50,008 (recorded), with match estimates far off
  (209 expected, 2 actual); `q=!` matches everything; `limit` above 100 resets to 20; hybrid
  search fails closed (503, `Retry-After: 60`) when OpenSearch fails after startup; the
  OpenSearch-only fallback branch is unreachable in production wiring.

## Approaches considered for the build

1. **Astro static site, demo as a framework-free island** (chosen). Every route is real HTML;
   the demo's recorded state is rendered at build time by the same module the page uses. Matches
   the onnwee.me stack the owner already runs.
2. Keep the Vite/React SPA and add the demo. Rejected: the SPA needs a separate route-HTML
   generator, ships React to pages that need none, and the demo does not need React.
3. Server-rendered Go site. Rejected: adds a runtime for content that is static, and the demo
   must run in the browser anyway.

## Architecture

### Site

- **Astro** (current stable), static output, served by the existing Nginx image. No React. Small
  TypeScript islands only where behaviour is needed (theme toggle, demo inspector, live mode).
- **Content** stays in `db/seed/portfolio.json`; Astro reads it at build time. Project pages, case
  studies, archive (`noindex`), résumé, contact and a colophon keep their current routes and
  redirects (`/projects/transcript-create`, `/projects/discord-spywatcher`, `/tools`).
- **Contact** keeps the Go API, PostgreSQL storage, 90-day pruning and email notification.
  The form becomes a small island posting to the same endpoint.
- **Deploy** keeps the current pipeline: GitHub Actions builds the web and API images and deploys
  over the tailnet. The route-contract check becomes "every sitemap route has a built page".

### The Clpr demo

- **Artifact**: built in Clpr's own CI as a release asset at a pinned commit: the search wasm,
  the migration SQL bundle, and a manifest (commit, date, gzip size, Go version, build tags).
  The portfolio pins one artifact version. The demo never builds Clpr code itself.
- **Prerequisite in Clpr**: move search (handler, request models, repository) into a package
  that does not import the rest of the app, and make production import that package, so the
  demo runs exactly what production runs. Target ≤ 6 MB gzip for the wasm.
- **Runtime**: a dedicated Web Worker holds Go wasm and PGlite; the page talks to it with
  `postMessage`, every request carrying an id; stale replies are ignored. The capture layer
  (see the prototype's `capture.mjs`) records each round trip: kind, SQL, parameters, start,
  duration, and the decoded frontend and backend messages with byte counts.
- **Data**: the pinned migrations, then 8 labeled fixture rows, then `ANALYZE`. Synthetic rows
  are generated in the worker on request; shrinking the table runs `VACUUM FULL` so plans reflect
  real table size.
- **Recorded run**: generated in CI by headless Chromium through the same worker, at the same
  sizes the page shows, and committed as data the build renders to static HTML. Every inspector
  panel is present in the static HTML (as sections, enhanced to tabs by script), so the recorded
  evidence is complete without JavaScript.
- **Live mode**: explicit button; states download size, memory and start-up time from the
  latest measurement; starts with 8 fixture rows; offers larger tables. Low-memory, Save-Data
  and narrow devices get a confirmation step. Stop and retry work; errors fall back to the
  recorded run.
- **Scripted cases**: relevance search, every result type, punctuation, missing `q`, `q=!`,
  limit above 100, hybrid search with OpenSearch refusing (labeled simulated, uses the real
  hybrid constructor with a stub provider). Each case has a one-line takeaway linked to the
  panel that proves it, and notes that pair a fact (with a link to the exact line at the pinned
  commit) with a judgment.
- **Inspector panels**: Response (results, raw headers and JSON, a `curl` for clpr.tv), SQL
  (clause summary first, full SQL and parameters), Wire (decoded messages per round trip),
  Timing (every millisecond accounted for: inside PostgreSQL calls versus outside them, with no
  guessed attribution), Plan (chart and table across table sizes, the crossover explanation from
  recorded costs, the full plan with hanging indents), Notes, Production (how the demo differs).

### Production evidence for Clpr

- A scheduled job (GitHub Actions is fine) probes public `clpr.tv/api/v1/search` from outside
  the homelab at a fixed interval and publishes a dated JSON summary: window, sample count,
  success rate, p95. The home page scores it against Clpr's own SLO (`docs/operations/slos.md`:
  search 99.5%, p95 750 ms, 30-day window) and omits the figure until the window has enough
  samples. Until then, a spot check may be shown only if it is labeled as one.
- No metric may come from homelab logs or a production database query. The incident write-up is
  the one exception: its quoted log lines are evidence, published only in the sanitized form the
  owner approves.

### The incident write-up

- One write-up at launch: "Search ran on its fallback for a day while every health check said
  healthy" (2026-11-13), built from the startup log and the public health endpoints. Its timeline
  ends at the restart or fix, or reads "ongoing as of <date>" if neither has happened. Publication
  needs the owner's approval of the rendered page. A written rule fixes the level of detail: no
  hosts, addresses, paths or topology. A build-time sanitizer fails on IP, hostname and path
  patterns as a second check.
- The home page shows the headline, two-sentence account, finding, proposed or shipped change and
  status, with evidence one disclosure down. A demo case should reproduce it (OpenSearch down at
  startup: 200 from the PostgreSQL path while readiness reports healthy).

### Visual system

Chosen from the subject (engineering records with sources) and checked against the style-web-ui
banned defaults:

- Type: IBM Plex Sans (400, 600) for text and headings, sentence case; IBM Plex Mono (400, 500)
  only for code, requests, identifiers and numbers. Self-hosted.
- Colour: light `--paper #f7f8f7`, `--ink #15181c`, `--ink-2 #4a515b`, `--rule #d3d8dc`, accent
  ink-blue `#0b5394`; status colours only for real states (`--ok #116329`, `--warn #7a4f00`,
  `--bad #a3201a`). A full dark palette (accent `#7cb4f2`). Both themes, with a toggle that names
  the mode it switches to.
- Shape: 4–6 px radius, no shadows, structure from rules and tinted code surfaces.
- Layout: a margin column for source and date beside each record; the request-path diagram is the
  recurring motif. No motion on load; the only animation is live-mode progress and a brief path
  highlight after a live request, both off under reduced motion.

## Phases

1. **Site shell on Astro**: visual system, content migration, project and case-study pages,
   résumé, contact island, colophon, redirects, Lighthouse and axe gates, deploy.
2. **Recorded demo**: demo page and home hero from the prototype's design; recorded run generated
   in CI; no live mode. Until phase 3 lands, the wasm may be built from a pinned scratch clone of
   Clpr (the prototype's `wasmdemo/main.go` approach), and the page says it was built outside
   Clpr's CI.
3. **Clpr prerequisites and live mode**: Clpr search package split and release artifact; size,
   memory and cross-browser (Chrome, Firefox, Safari) gates; live mode on.
4. **Evidence**: external probe and SLO figure; incident page after owner approval; the incident
   reproduction case.
5. **Depth** (from the final panel round, in priority order): named trace spans for time outside
   PostgreSQL (in-memory OpenTelemetry exporter or bridge and Go timestamps); stepped table sizes
   with live runs plotted on the chart; forced alternative plans at the same size so the two
   lines cross; a wire ladder with real hex for one message.

## Rollout (builder's call, owner may override)

Ready pull requests to `main` merge and deploy themselves, and the owner is interviewing, so the
live site must not change piecemeal. The rebuild lives on `feat/technical-portfolio-overhaul`;
phase pull requests target that branch. The branch merges to `main` once phases 1 and 2 pass
their gates, replacing the React site in one deploy. Later phases go to `main` as usual.

## Gates

| Gate | Fails when | Fallback |
|---|---|---|
| Route contract | a sitemap route has no built page | build fails |
| Lighthouse, axe | budgets above are missed | build fails |
| Demo parity | a scripted case's status or JSON differs between the native Clpr binary on PostgreSQL 17 and the wasm build | build fails |
| Fuzzed `q` | any 5xx, or a recovered panic | build fails |
| Live mode size and memory | wasm > 6 MB gzip, or peak memory over the recorded budget in headless Chromium | live mode off, recorded run only |
| Cross-browser | the scripted suite fails in Firefox or Safari | live mode off for that engine |
| Pin drift | Clpr's GitHub `main` is ahead of the pinned commit (no public source says which commit production runs) | caption says "pinned <sha>; Clpr main is N commits ahead" |
| Sanitizer | IP, hostname or path patterns in published evidence | build fails |

## Decisions that are the owner's

1. **Clpr's production state**: as of 2026-11-14 03:14 UTC, clpr.tv still serves search from the
   PostgreSQL fallback after a 2026-11-13 startup could not reach OpenSearch; readiness reports
   healthy. Restart now, and approve the fix (retry after startup, report the active backend in
   readiness, decide on a runtime fallback)?
2. **Publishing the incident** at the stated level of detail.
3. **Clpr-side work** (another repository, whose merges deploy to production): the search
   package split; a release job that publishes the wasm, migration bundle and manifest; and the
   parity and fuzz gates, which need the native Clpr binary on PostgreSQL 17. Recommended: all of
   it in Clpr's CI, so the portfolio never builds Clpr code.
4. **The probe and Clpr's analytics**: every search writes a `search_queries` row that feeds
   Clpr's trending and popular-search lists, so a probe running every few minutes for 30 days
   would dominate them. Recommended: Clpr skips `TrackSearch` for a probe identified by a header
   or user agent (another Clpr change); until then, no probe.
5. **The content security policy for the demo**: the edge CSP (`deploy/caddy/patrickfanella.caddy`,
   applied by hand on the edge host) blocks WebAssembly compilation. Recommended: serve the wasm
   from the same origin and add `'wasm-unsafe-eval'` to `script-src` for the demo route only.
6. **Why production is configured for hybrid search**, in one sentence, for the demo's notes.

## Left to the builder

Astro version and integrations; component structure; CI job layout; the exact probe interval and
host; how the recorded run is stored; copy edits within the rules above; the other two case
studies' artifacts (dated facts plus one real artifact each).
