# Plan

The rebuild of patrickfanella.co. The live site still comes from `subculture-collective/patrickfanella-co`; this repository replaces it at the launch issue. The work is tracked as a roadmap in this repository's issues and its linked Project.

## Goal

A portfolio that shows the work running instead of describing it. A 30-second reader sees the name, role, availability and one business result on the first screen. A technical reader can watch real code run in the browser and check every number.

## What exists (2026-11-14)

- The landing page: the name pours a live fluid simulation (WebGL2, stable fluids) as each letter lands, with a short plan of what is coming.
- The motion set (`/motion/`): pour-in, bleed, splash, stir, rise, unfold, hand-over, theme switch and focus, each with a reduced-motion version.
- Light (ink on paper) and dark (ink that glows) themes, phone layouts, and a static fallback without WebGL2.

## What is coming, in order

1. **The desk.** A tiling terminal desktop on the ink. PostgreSQL 18.6 (PGlite) runs in a worker, loads 50,008 clips and times Clpr's search with and without its index. A shell pane takes commands. Prototype: [docs/prototypes/desk/](prototypes/desk/).
2. **Clpr, running live.** Clpr's production Go search code, compiled to WebAssembly, answering searches against that database, with the SQL, wire messages, timings and query plans on screen. Proven in a spike at 9.3 MB compressed; it ships once it is under 6 MB, which needs work in the Clpr repository. Design and spike results: [docs/design/2026-11-14-rebuild-design.md](design/2026-11-14-rebuild-design.md).
3. **Content pages.** The projects from the current site, a résumé, and case studies that set real code beside notes on why it is written that way.
4. **Launch.** A private preview, real-device checks, then replacing the live site in one deploy.

## Decisions

- Vite with plain TypeScript, no framework, for now. Whether content pages need a static-site generator such as Astro is decided by a spike before they are built.
- Every number on the site is measured or labelled as recorded or simulated, with its source.
- Every animation has a reduced-motion version that leaves the page complete and still.
- Fonts are self-hosted and nothing loads from third-party hosts, so the production content security policy needs only `'wasm-unsafe-eval'` added for the desk.
- Project content keeps its source of truth in `patrickfanella-co`'s `db/seed/portfolio.json` until launch.

## Owner decisions still open

From the design doc, these need Patrick before the work that depends on them:

- The Clpr-side work: splitting search into its own package and publishing a release artifact from Clpr's CI.
- Publishing the 2026-11-13 Clpr search incident as a write-up.
- Where the preview and the launched site are hosted, and the content security policy change for WebAssembly.
