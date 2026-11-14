# Rebuild prototype (reference only)

Throwaway prototype from 2026-11-13/14, kept as evidence for
[the rebuild design](../2026-11-14-technical-portfolio-rebuild-design.md). It is not product
code: do not import it, and do not extend it. Rebuild from the design.

What is here:

- `concepts-r0.md`: the five concepts the first panel scored.
- `concept-r2.md`: the concept the final design grew from.
- `wasmdemo/main.go`: the demo entry point that wraps Clpr's real search handler and
  repository, and connects pgx to PGlite through a `net.Conn`. It was built inside a scratch
  clone of Clpr at `aa41764`, because Go only allows `internal/` imports from inside the module.
  Build: `GOOS=js GOARCH=wasm go build -tags nomsgpack -ldflags="-s -w" -trimpath`.
- `capture.mjs`: reads pgx's frontend messages and PostgreSQL's replies at the bridge, and
  times each round trip. Also the fixture rows and the synthetic-row generator.
- `live-worker.mjs`, `demo.js`, `render.mjs`, `build.mjs`, `styles.css`, `cases.mjs`: the
  prototype pages. `render.mjs` is shared by the static build and the page.
- `record.html`, `record-cdp.mjs`: record the scripted requests in headless Chromium through
  the same worker that live mode uses.
- `recorded.json`: one recording (Chrome 156, 2026-11-14).
- `screenshots/`: the final prototype, downscaled to 900 px wide.

The prototype served `node_modules` (PGlite 0.5.16, `@electric-sql/pglite-pgvector`, IBM Plex
from Fontsource) and the compiled `clpr.wasm` from a local server; neither is committed.
