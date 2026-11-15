# Recorded Clpr inspector

The desk builds all five inspector sections from `src/desk/inspector/recorded-run.json`.
Response, SQL, Timing and Wire show the `world record` request against eight fixtures.
Plan shows both alternatives at 8, 1,008, 10,008, 30,008 and 50,008 clips. The record contains
the complete response, captured statements/parameters, wire frames and plans at every size.
The initial inspector remains readable without JavaScript, a worker or a database download.
Without scripts, panes use the existing solid background token, with no entrance motion or
backdrop blur, so a long transcript does not depend on a large composited phone surface.
With scripts, the sections become tabs. A live response replaces their contents; stop, retry
and startup failure restore the same recorded HTML. The separate SQL benchmark retains its
older, dated prototype comparison and is shown only when that mode is selected.

Astro and the live inspector use `render.ts`, including the same plan chart and table.
Captured strings are escaped before becoming HTML. The recording JSON is a build input, not
a client-side import; visitors receive the rendered evidence instead of downloading that JSON.

## Reproduce or update

On Linux, with dependencies and Playwright Chromium installed:

```sh
npm ci
npx playwright install chromium
npm run record:clpr
node scripts/check-clpr-recording.mjs --built
```

The command builds the site, starts a temporary server bound to localhost, and launches one
headless Chromium with a blank harness. It starts the exact compiled `clpr.worker` used by the
desk; it does not implement another SQL or Go path. The harness uses the site's CSP. It waits
for all migrations and Go startup, then sends the same worker requests as live resizing.
Each request runs the handler, capture and plan comparisons. It checks HTTP 200, the row count
and plan availability, writes the data atomically, and rebuilds the site from that data.
It closes its own browser and server on success or failure. A failed capture leaves the prior record intact; a successful capture replaces it atomically before the final build.

The build writes a source fingerprint and worker SHA-256 to
`dist/_astro/clpr-recording-build.json`. The recorder refuses a stale build. Inputs in
`recording-inputs.json` cover the worker, protocol, capture, decoder, plans, pinned manifest
and dependency lockfile, plus the build configuration and recorder itself. `--built` checks
that the final build uses the recorded worker.
The recording also names Clpr's source commit, PostgreSQL, migration count, Chromium version,
platform, UTC date, payload sizes, startup duration and checkout HEAD. The fingerprint identifies
the worker sources even when a local capture includes uncommitted work. CI recordings include
their GitHub Actions run URL. A local capture is explicitly labelled local; it is not CI evidence.

## Memory and size gate

`recording-policy.json` fixes two limits: 6,000,000 bytes of compressed Clpr Wasm, and
2,147,483,648 bytes (2,048 MiB) of sampled Chromium process-tree RSS. The memory cap was chosen
after the initial five-size local recording measured about 1.65 GiB by this metric, leaving
roughly 20 percent headroom. Changing a limit requires a new recording; it is never raised
automatically to make a run pass.

The Linux recorder samples `/proc` every 50 ms from the launched Chromium PID through all
descendants, after browser launch through the 50,008-row comparison. It sums resident memory,
including WebAssembly and browser processes. Shared pages can appear in more than one process,
so this is a conservative process-tree sum, not unique allocation or JavaScript heap usage.
Sampling can miss shorter peaks. The blank harness excludes the ink; the value is a recorded
demo measurement, not a promise about the visitor's device or the whole desk's memory use.

Download size is the sum of distinct response payloads served to the worker, including Go,
PGlite, extensions and migrations; it excludes HTTP headers and the desk UI. Compressed Wasm
bytes are checked against the actual pinned gzip file. The start button states total MB and
sampled peak MiB, while the recorded caption explains the method, budget and startup duration.

Astro disables live mode when either limit is exceeded, measurements are missing, or the
worker/artifact/budget differs from the record. The script checks that gate as well as disabling
the button. A recording over budget still builds complete static evidence. Live-only tests are
explicitly skipped with the recorded policy reason; static evidence and policy tests still run.
Browsers unable to start WebAssembly keep the recorded evidence through the existing error path.

## CI and preview artifacts

The `record` CI job runs `npm run record:clpr` on every PR and push to main. It uploads
`recorded-site`, containing the fresh JSON and built `dist/`, with a 14-day retention period.
The test job downloads it, checks the data against the worker hash, typechecks, and tests that
exact output. The main-only preview job downloads the same artifact after tests pass, then
publishes it through the existing deploy branch. It does not rebuild from the older repository
snapshot. Production cutover remains roadmap issue #23.

The committed JSON supplies reproducible offline builds. To refresh that snapshot from a green
CI run, download only `src/desk/inspector/recorded-run.json` from its `recorded-site` artifact,
check its source fingerprint against the current worker inputs, build and review the change,
then commit it. CI continues to generate a fresh record for each build; no bot writes source
commits or has extra repository permissions.

Checks include schema/provenance and raw-byte totals, source/worker hash matching, both memory
and size boundaries, missing/stale measurements, renderer escaping, all five panels without
scripts, no eager large downloads, measured button text, denied-button enforcement, live searches,
and returning to the recorded inspector after stop. Keyboard, accessibility and narrow-layout
checks apply to both the recorded and live content.
