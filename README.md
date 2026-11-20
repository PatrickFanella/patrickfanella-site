# patrickfanella-site

The static rebuild of patrickfanella.co, started 2026-11-14. Deployment, verification and the retained legacy frontend are described in the [production runbook](docs/production-cutover.md). What is planned and in what order: [docs/plan.md](docs/plan.md) and the pinned roadmap issue.

Static pages:

- `/` introduces the work and links to the desk, case studies, projects and résumé. The ink behind it is a fluid simulation that pours from the letters of the name. It runs on WebGPU compute where the browser gives a hardware adapter, and on WebGL2 everywhere else; the readout under the intro names the path in use.
- `/desk/` is the desk: translucent panes tiled on the same ink. The name hands over from `/` into the about pane. The projects pane links to the four featured case studies. The psql pane offers two opt-in modes. Clpr live mode loads a pinned CI build of Clpr’s real Go handler and repository, applies all 155 bundled migrations to PGlite, and searches eight labelled fixture clips through pgx. The manifest’s source commit and date, gzip size, Go version, and CI run are shown above the controls. `search world record` opens the Response, SQL, Timing, Wire and Plan inspector tabs with the handler’s headers/JSON, captured statements and parameters, and measured time inside/outside PostgreSQL bridge calls, decoded protocol messages with byte counts and raw hex, and sequential/GIN query-plan comparisons (see [inspector evidence limits](docs/search-inspector.md)); request time includes the handler and pgx round trips, rather than only a SQL query. The Plan tab grows or shrinks the live table from 8 to 50,008 clips, runs `VACUUM FULL` and `ANALYZE`, then repeats the handler request and charts both alternatives’ estimated costs across measured sizes. The complete inspector is also rendered as static HTML from a recorded run, including when JavaScript is off. The live button states the measured download and memory; a stale recording, Wasm above 6 MB gzip or recorded Chromium RSS above 2 GiB disables it. Stop and retry restore recorded evidence and terminate/recreate the worker. See [recording provenance and limits](docs/clpr-recording.md). The SQL benchmark starts PostgreSQL 18.6 (PGlite) in a separate worker, loads 50,008 generated clips and runs Clpr's search query without and then with its GIN index. It shows the query plan, the rows and the median of three timed batches each, measured in the tab. A batch repeats the query for 50 ms and takes the mean, because browsers round a worker's clock to 0.1 ms or 1 ms; a time too close to that resolution is shown as a bound, with no ratio. The plan's Execution Time is the same batch mean. Until PostgreSQL answers, or if it cannot start, it shows Clpr's recorded run and says so. A slow download is not treated as a failure: after 30 s the pane says PostgreSQL is still loading, and the measured run still replaces the recorded one when it arrives. The log shows startup events on the page Performance clock; the process pane refreshes ink and SQL-benchmark database statistics every second. Neither mode downloads its worker, WebAssembly or database data on page load. Alt+1 to Alt+5 move focus between panes.
- `/projects/` presents four featured case studies and twelve supporting projects, with source-reviewed copy and explicit preview/research limits. The original 40 project URLs remain available as current or historical detail pages; Clustr, Stupen and Pult add three new detail routes.
- `/resume/` publishes the source-matched résumé, same-origin PDF and print stylesheet.
- `/contact/` preserves the old contact route with email, GitHub and LinkedIn links.
- `/case-studies/` introduces Clpr, Clustr, Rekolekt with HasanAra, and Undertow. Each product study includes dated screenshots, implementation decisions, tradeoffs and commit-pinned sources. Eight original application captures and their provenance are in `docs/evidence/portfolio-2026-11-16/`; `node scripts/process-project-captures.mjs` regenerates the responsive WebP and social images.
- `/case-studies/clpr-request/` preserves the pinned request-setup walkthrough. `/case-studies/clpr-search/` explains Clpr ranking and pagination with pinned source excerpts and owner-approved notes. See [study provenance](docs/clpr-search-study.md).
- `/motion/` shows each animation in the motion set on its own, with its timing and its reduced-motion version.

```bash
npm ci
npm run dev        # http://localhost:4321
npm run build      # astro check, typecheck, then build to dist/
npm run preview
npm run test:unit  # run the tests that need no browser and no build
npm run test:e2e   # build, serve dist/ and run the browser tests in headless Chromium
```

`npm run test:unit` runs Vitest over `src/**/*.test.ts`. A test belongs there, beside the module it covers, when it calls TypeScript directly and needs neither a page nor `dist/`: the live-mode gate, the SQL benchmark's arithmetic, search-word escaping, the Inspector's markup escaping, the wire decoder, statement capture and plan rollback today, and data assembly as it gains direct tests. A test that opens a page or reads the built site belongs in `e2e/`. CI runs the unit tests first, before it records or builds anything.

The browser tests in `e2e/` use Playwright. Install its Chromium once with `npx playwright install chromium`. They check that the name pours in and fits the width, that reduced motion gives a still frame within 3 s of the fonts loading, that the page works without WebGL2, that the desk measures the search in a worker while the ink keeps drawing, that a slow download still reaches the measured run, that it falls back to the recorded run when the worker script, PGlite's WebAssembly or a policy without `'wasm-unsafe-eval'` stops it, and that axe finds no accessibility violations on either page in either theme. `e2e/motion.spec.ts` checks that a replayed pour lands each letter only once it has hit, that fitting the name does not move the page, that the ink canvas stays clear until the solver draws, and that the selected work rises and in-page links glide with motion and do neither with reduced motion. Chromium runs WebGL2 on the CPU through SwiftShader, so the tests behave the same with or without a GPU. They do not compare screenshots of the ink, which differ between GPUs. They serve `dist/` with `astro preview`. Set `E2E_PORT` to serve on a port other than 4173.

CI (`.github/workflows/ci.yml`) records Clpr through the visitor worker in headless Chromium, rebuilds from that evidence, and tests the resulting artifact on every push to main and pull request. It also enforces mobile Lighthouse budgets. The main-only deploy job publishes that tested artifact for production. Run `npm run record:clpr` on Linux to refresh the local recording.

## Deployment and metadata

Every green build of `main` publishes the tested files to the `deploy` branch. The Almaz updater reads that branch every minute and selects the production release at https://patrickfanella.co; `/REVISION` names its source commit. The private hosted preview was retired on November 16, 2026. Local `astro preview` remains available for development.

The shared HTML metadata, structured profile, favicon fallbacks and home-screen manifest are described in [site-metadata.md](docs/site-metadata.md). Run `node scripts/generate-site-icons.mjs` to regenerate the recorded format derivatives from the approved compact PF artwork.

## Layout

The pages are built with Astro as static HTML. There is no client router and no UI framework, and no Astro code ships to the browser. Each page loads its script as a plain TypeScript module, which Astro bundles with Vite.

- `src/pages/`: `/`, `/desk/` and `/motion/`.
- `src/layouts/Page.astro`: the head, body class and ink canvas every page shares.
- `src/ink/shaders.ts`: stable fluids (advection, vorticity confinement, buoyancy, Jacobi pressure solve) in WebGL2 fragment shaders. Both themes blend the same Ember pigments (brick `#CA5148`, amber `#D29528`, plum `#8055AA`) over their ground; `src/ink/engine.ts` holds those RGB values. The static fallback uses matching `--ink-*` tokens in `site.css`.
- `src/ink/wgsl.ts`: the same solver and looks as WebGPU compute shaders.
- `src/ink/webgl.ts` and `src/ink/webgpu.ts`: the two paths. Both take the same tunables and step input from the engine. WebGPU runs a 320-row grid against 256 on WebGL2. It is used only with a hardware adapter whose first frame runs cleanly offscreen; otherwise WebGL2 takes the canvas. Add `?ink=webgl2` or `?ink=webgpu` to the URL to pick a path; the second also accepts a software adapter.
- `src/ink/mask.ts`: draws the page into the solver's mask. Letters marked `data-ink-letter` are solid and pour from their feet once they carry `data-pour`. Elements marked `data-ink-solid` are solid rectangles.
- `src/ink/schedule.ts`: the engine's arithmetic as pure functions on plain numbers: the burst queue, the preroll time budget, grid and canvas sizing, the resize keep ratio, and whether a reduced-motion still must be made again. `src/ink/schedule.test.ts` tests them directly.
- `src/ink/engine.ts`: the frame loop, choosing a path, and the API the pages use: `setEmitters`, `burst`, `stir`, `setTheme`, `preroll`, and `ready`, which `boot()` waits on before the pour starts. Up to four bursts run at once, each with a direction, spread and length. When the window changes size, the engine resizes the canvas and grids to the new viewport and both paths carry the velocity and ink over, anchored at the top left, so the ink stays where it was on screen; what no longer fits is cut off, and new space starts empty. A resize event at an unchanged size does nothing. A reduced-motion still is not stepped again, so after a change of width, or of more than 120 px of height, the engine empties the tank and makes the still again for the new layout; a smaller change of height, such as a phone's toolbar showing, keeps the carried still with its bottom cut off, and the still is made again once the viewport is taller than what is left of it, as when the toolbar hides. A page that loads with a viewport of 0 by 0 starts its ink at the first resize that gives it a size. When the browser drops the WebGL2 context, as iOS Safari does to background tabs, the ink stops and the tab showing again does not restart it; once the browser restores the context, the engine rebuilds the solver on the same canvas, running or as a new still. `e2e/ink-persistence.spec.ts` drops and restores the context with `WEBGL_lose_context`. A phone resizes the window each time its toolbar hides or shows during a touch scroll, so a resize must never empty the tank; `e2e/ink-persistence.spec.ts` guards this on WebGL2; no test runs the WebGPU path, because headless Chromium has no usable WebGPU adapter.
- `src/motion/motion.ts`: the motion set. Pour-in, bleed, splash, stir, glide, unfold and fitting the name to the width. A replayed pour cancels the run before it, so that run's timers cannot land a letter early.
- `src/display-face.ts`: the display face as `document.fonts.load` takes it, shared by `boot()`, the Desk startup log and the specs.
- `src/boot.ts`: start-up shared by every page: fonts, theme switch, ink, readout. Once the display face and the solver are ready it starts the ink: running, or one still frame run ahead with reduced motion. A page that pours letters passes `boot()` the step that lands them.
- `src/desk/desk.ts`: the desk page: pours the name from the about pane and moves focus between panes.
- `src/desk/pg.worker.ts`: PostgreSQL (PGlite, bundled from npm) in a module worker. It seeds the clips, times three batches of the query without and with the index, and posts each step. It reports failures inside PGlite's start-up, which never reach the page's `Worker.onerror`. The worker stays available for shell searches.
- `src/desk/clpr.worker.ts`: loads the pinned Clpr artifact, verifies its Wasm and migration hashes, applies every migration, seeds eight fixtures, and runs requests through the Go handler and pgx bridge.
- `src/desk/inspector/recording.mjs`: the recorded Clpr run's contract: the fixture count and table sizes, the source fingerprint and `parseRecording`, which writes, checks and types the recording. See [clpr-recording.md](docs/clpr-recording.md).
- `src/desk/pane-modes.ts`: which mode the psql pane is in (recorded run, SQL benchmark or Clpr live), each mode's state, status copy, stop/retry, stale worker replies and shell request routing. No DOM; it takes its worker factories as arguments, and `pane-modes.test.ts` covers it directly.
- `src/desk/pane-controls.ts`: the psql pane's controls as elements: the example search, the pinned build's provenance, the mode buttons and the status line.
- `public/clpr/`: the pinned manifest and its payload, copied from Clpr CI. See [docs/clpr-artifact.md](docs/clpr-artifact.md) for updating it.
- `src/desk/psql.ts`: the psql pane and its timing panel; it creates the workers and writes each view of the modes to the page. `src/desk/benchmark.ts` holds the SQL benchmark's arithmetic and wording, with no DOM or worker: how a time is shown at the clock's resolution, the tidied plan, the scan name and the ratio sentence; `benchmark.test.ts` covers it directly. `src/desk/recorded.ts` holds Clpr's recorded run; `src/desk/pg-protocol.ts` holds the query and the messages.
- `src/styles/site.css`: tokens (colour, type, four durations, two curves), layout, rise, view transitions and reduced motion.
- `src/styles/desk.css`: the desk's tiling layout. Its colours are the `--desk-*` tokens in `site.css`, separate from the smoke palette. Panes 1, 2 and 5 keep their gold, cobalt and orange accents. Panes 3 and 4 keep the prototype's pink and green, so the five pane buttons stay distinct.
- `docs/`: the plan, the original design doc and the prototypes the roadmap builds from.

## Motion set

| Name | Trigger | Timing |
|---|---|---|
| Pour-in | Page load | 620 ms per letter, 60 ms apart, spring curve; ink splashes down as each letter hits |
| Bleed | Hover or keyboard focus on `data-bleed` | in over 240 ms, out over 400 ms, timed by the clock so 120 Hz screens match 60 Hz |
| Splash | Press on `data-splash` (pointer, Enter, Space) | one solver step |
| Stir | Pointer movement, scrolling | continuous |
| Rise | Scrolling a `data-rise` element into view, including the selected work on `/` | CSS scroll-driven animation |
| Glide | Following a link to a place on the same page, on `/` and `/motion/` | the browser's smooth scroll, for that scroll only |
| Unfold | Opening a `details[data-unfold]` | 420 ms view transition |
| Hand-over | Following a link between pages | 620 ms cross-document view transition |
| Theme switch | The switch in the top bar | 420 ms view transition |
| Focus | Tab, Shift+Tab | 240 ms |

A WebGL2 or WebGPU canvas is black until it is first drawn on, so the ink canvas stays clear until the solver is ready and then fades in over 240 ms. The landing page's stylesheet gives the name the size `fitWidth()` will give it, and the script refits only once the display face has loaded, so the page below does not move when the name is fitted.

With `prefers-reduced-motion: reduce`, the solver runs ahead and the page shows one still frame, letters start in place, in-page links jump, and transitions and view transitions are off. The run-ahead stops after about 1.5 s of GPU time, so a slow or software GPU shows a less poured frame instead of freezing the tab. Without WebGPU or WebGL2 the page falls back to a static wash in the same three inks.

## Licence

GPL-3.0-or-later, as in the repository it came from. See [LICENSE](LICENSE).
