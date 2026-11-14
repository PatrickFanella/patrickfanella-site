# patrickfanella.co rebuild: concept briefs, round 0

## Context (shared by every concept)

**Who it is for.** Patrick Fanella is actively interviewing for senior full-stack / backend
engineering roles (Chicago or remote). Readers are hiring managers, staff engineers doing a
portfolio screen, and recruiters. A screen usually lasts 30 seconds to 5 minutes, often on a
laptop, sometimes on a phone. The site must make a senior backend engineer look like one.

**What the owner asked for.** A full rebuild that is "really technically complex" and "as
technically impressive or more" than his personal art site onnwee.me, but that looks
professional instead of chaotic. Stack is open; starting from scratch is allowed.

**onnwee.me, for reference.** An Astro static site. A full-screen WebGL2 canvas sits behind
the content: each frame, code draws scenes into a hidden 720px canvas (archival photos, a
face, scroll-scrubbed film) and a shader reduces it to black, white and one spot color with
an 8x8 Bayer dither. Sections are TV "channels" with their own spot color and static
transitions; content sits in retro OS windows. Generated WebAudio, a SomaFM radio, a 10 s
intro, drag-and-drop "run your own footage through the filter", a "how this works" colophon,
no cookies, reduced motion honored. The persona is anonymous and dark (surveillance history,
skulls). The rebuild keeps the ambition, not the persona.

**What exists today.** Vite + React SPA, Go API (contact form only), PostgreSQL, Nginx image on
a homelab server, deploy from GitHub Actions. ~40 catalogued projects, 25 on the main page,
3 flagship case studies:
- Clpr: Twitch clip discovery with search, playlists, moderation; built and operated by him.
- HasanAra: searchable broadcast archive; React frontend on Rekolekt (his Python/FastAPI
  ingestion, transcription and search services).
- Undertow: browser music-video editor with layered visuals, timed lyrics, local MP4 export.
Other notable work: Prichal (Go control plane for managed AT Protocol hosting, mTLS agents),
Headcount (Go + TimescaleDB time-series dashboard), Arkhiv (archive engine, 6 collection
sites), Left Field (Next.js + PostGIS research app), Switchyard (workflow/automation runtime),
a self-run homelab (Debian, Docker, CI runners, Prometheus/Alertmanager, Postgres).
Every project carries an honest delivery status (pre-alpha work is never sold as production).

**Hard constraints.**
- Mobile Lighthouse budgets for performance, accessibility, SEO; no layout shift.
- WCAG AA, keyboard-complete, `prefers-reduced-motion` honored, content readable with
  JavaScript or GPU features off.
- WebGPU is in Chrome/Edge, Safari 26+ and Firefox on Windows/Apple Silicon, but not Firefox
  on Linux or most Android Firefox: anything GPU needs a WebGL2 or static fallback.
- One person maintains it. No claims, metrics or demos that are not real.
- Privacy: no tracking beyond self-hosted Plausible; nothing exposes homelab internals.

## Concept A: Living Architecture

A quiet editorial site whose single visual centerpiece is a GPU-rendered system diagram. Each
case study's real architecture (services, queues, databases, external APIs, taken from the
existing component-flow diagrams) is laid out by a force simulation computed on the GPU
(WebGPU compute, WebGL2 transform-feedback fallback, static SVG last). Simulated requests
travel the edges as particles, with rates and latencies set from the project's real design
(e.g. Clpr's ingestion fan-out vs. read path). Scrolling morphs the graph from one project to
the next. Clicking a node opens a panel with the real code excerpt, schema or config behind it.
Wow factor: visual and immediate. Risk: reads as "pretty diagram"; simulated traffic is not
real traffic.

## Concept B: Run It Here

The impressiveness is functional, not visual. Each flagship case study embeds a real, working
slice of the project that runs entirely in the visitor's browser:
- PGlite (Postgres compiled to WASM) seeded with the project's actual schema and a small
  sanitized dataset; a SQL console with prepared queries ("how clip search ranks results",
  "Headcount's continuous aggregate"), EXPLAIN plans rendered visually.
- The project's Go HTTP handlers compiled to WASM and mounted behind a service worker, so the
  visitor sends real HTTP requests (with a request inspector) to a real handler and a real
  Postgres, with no server involved.
- Undertow's actual render pipeline exporting a short MP4 locally.
The surrounding site is calm, typographic and fast; demos load only on request. Wow factor:
"I just ran his backend in my tab." Risk: heavy downloads (PGlite ~3 MB, Go WASM 5-15 MB),
engineering effort per demo, keeping demos in sync with real repos.

## Concept C: The Site Observes Itself

Reliability is the portfolio. The site's own stack (edge, Go API, Postgres) is instrumented
with OpenTelemetry. Any page has a toggle that shows the actual trace of the request that just
served it, as a waterfall, plus build provenance: commit, CI run, image digest, SBOM and a
Sigstore signature the visitor can verify. A public status page shows real SLOs from
independent probes, error budget burn and the deploy history. Case studies include
postmortem-style write-ups. Wow factor: rare, very senior-backend. Risk: visually dry; must
avoid exposing infrastructure; the "trace of this page" is only interesting if the backend
does something nontrivial per request.

## Concept D: Atlas

All repositories' git histories (commits, files touched, languages, dependency graphs) are
collected at build time and turned into a single topographic map rendered on the GPU: contour
lines like a survey chart, projects as peaks whose height and shape come from real activity,
rivers for shared libraries. Scrolling or arrow keys fly across the map; each peak opens its
case study. A time slider replays how the body of work grew year by year. Wow factor: unique,
data-driven art that still looks like a professional chart. Risk: beautiful but says little
about *how* he engineers; commit volume is a weak signal of quality.

## Concept E: Postmortems You Can Scrub

Case studies are told as engineering events, each a deterministic replay built from real,
sanitized logs and metrics: a database migration with 23 seconds of downtime, a cutover of an
operating system under 55 running containers, a cache bug found by a fs-verity read fault.
A timeline scrubber drives synchronized panels (log tail, metric charts drawn on canvas,
topology diagram, the decision taken at each moment). Wow factor: shows judgment under
pressure, which is what senior hiring is about. Risk: requires careful sanitizing; many
events are homelab rather than product work; less "look at this" on first load.
