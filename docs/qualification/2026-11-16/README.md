# Frontend and Ink in Motion candidate qualification

This is the technical qualification for #72, dated November 16, 2026 UTC. Owner review #73,
physical-device/browser qualification #20 and release #74 are separate gates. No production
activation is part of this report.

## Candidate identity

The integration starting point was `86d0960f1dda7734cdf4809fdbd6246f931426cc` (Wave 4).
Its exact-head [manual CI run](https://github.com/PatrickFanella/patrickfanella-site/actions/runs/43800795092)
passed, as did the local 101-test suite. Expanded qualification found #87: enlarged text caused
overflow on catalog, résumé, contact and motion pages. PR #88 fixes that defect separately.
The owner then requested the résumé treatment delivered by PR #89.

The final runtime source checked here is **`1305a08e70b6970360a1cd5e391ea3018b8c04f1`**,
containing both changes. This qualification PR adds tests and evidence, with no further runtime
changes. Its eventual integration merge must retain the same runtime inputs; record that full
merge SHA, hosted CI run and artifact identity in #72 before closing it. If runtime inputs change,
this record no longer qualifies that candidate.

[local-artifact.json](local-artifact.json) records SHA-256 for every runtime input, all 243 local
built files, their aggregate identities, all seven selected brand assets and the résumé receipt.
This local build uses the checked-in Clpr recording. Hosted CI records Clpr again, so its tested
artifact has a separate identity; do not equate its variable recording bytes with the local build.
The source build produces no deployment `/REVISION`; publication adds that file only on main.
Aggregate digests hash the UTF-8 encoding of Python's
`json.dumps(entries, sort_keys=True, separators=(',', ':'))`; each entry array is sorted by path.

Selected brand source: Studio commit `0b9e6f4bf88493a33a17c50d2f2623b4fabdebf7`, selected
Ink in Motion / 06 assets plus the solid wavy backup. Original public brand bytes remain pinned.
The PDF stretches a decorative copy of the ink scene; it does not rewrite the selected SVG.

## Checks and evidence

Local conformance result: **PASS**. The complete suite passed 105 Chromium/Firefox tests; all
five isolated mobile Lighthouse audits passed (performance at least 0.95, other categories 1.00,
maximum CLS 0). Hosted checks on the qualification PR remain a separate merge requirement.

[results.json](results.json) records the completed local commands and their outcomes.
[lighthouse-summary.json](lighthouse-summary.json) records the final mobile audit and graphics
configuration. The first concurrent audit is retained separately as
[lighthouse-concurrent.json](lighthouse-concurrent.json); it failed the contact performance budget
with 1,534.5 ms total blocking time while the browser suite was also running. The final audit is
run after the suite, with the same thresholds and no production code adjustment for that result.

| Surface | Verification |
| --- | --- |
| Build and provenance | Astro/type checks, maintained PDF inputs, recorded Clpr validity and all 40 project routes |
| Layout and identity | Both themes; 320×740, 390×844 and desktop; large name, first-screen hiring context, visible ink and both primary actions |
| Text resizing | Eight routes at 200% root text size, both themes and three viewport sizes; affected content/motion pages also checked without JavaScript |
| Native browser zoom | Chromium tab zoom set to 2.0; layout viewport changes from 1280 to 640 CSS px and device pixel ratio doubles; eight routes and study anchor focus checked in both themes |
| Keyboard | Shared Work/Résumé/Contact paths, visible focus, theme persistence, Desk pane/tab controls and sticky study anchors |
| Motion and graphics | Normal and reduced motion, still-frame budget, no-JS content, unavailable-graphics fallback, software WebGL2 functional tests |
| Projects and study | All 40 pages/social cards/media, complete directory anchors, direct Clpr study link, source lines and interrupted name transitions |
| Desk | Recorded evidence without large downloads; opt-in live fixture handler, generated SQL benchmark, stop/failure/retry and measured/recorded status boundaries |
| Download and print | Real download event, filename and PDF hash; one-page generated download and exact one-page full web print |
| Deployment helpers | One isolated edge-route test and three immutable-asset/release-switch tests; these do not activate production |

Native zoom uses the browser's [Tabs zoom API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom)
through a temporary local extension in a disposable persistent context, following
[Playwright's extension procedure](https://playwright.dev/docs/chrome-extensions).
The extension is test-only and never enters the site build. Root text scaling is a separate check.

## PDF inspection

The owner chose a centered name/contact header, left-aligned body, translucent PF, and a wider,
vertically compressed ink band with its right side higher. The final download has 20% ink opacity,
a nine-degree tilt and 40% logo opacity. It remains one Letter page, with four link annotations.
Two renders matched SHA-256
`6c9e4329e80485cc49cd4c2bc321f1410c27c8a0ee71ed3366156ddf655f3600`.
Extracted text matches the earlier download in order and content, including the preferred email
and approximate DeliverZero outcome. Poppler renders of the download and full web print were
inspected for clipping and readable text; the last earlier-experience sentence is present in the
one-page web print. The compact download and full web print contain different documented subsets.

## Graphics and device limits

The shared actual-app preview reported WebGL2 on **ANGLE / Vulkan SwiftShader Device (Subzero)**.
It supplied no hardware WebGPU adapter. Its frame rate is software-rendering evidence, not a
hardware performance measurement. Lighthouse's default headless Chrome reported WebGL/WebGPU
disabled; its page-level `staticInkFallback` observation was null, so that field does not prove
the CSS fallback. Separate functional no-GPU tests explicitly assert the static fallback.

Device discovery found an Android 15 emulator, not a physical phone. Opening Chrome returned
`DEVICE_IN_USE`; read-only session inspection confirmed another session owned it. No UI was driven
and no ownership was taken. iOS was unavailable: `iOS Simulators need macOS with Xcode.`
No physical iPhone, Android, or macOS Safari result is claimed. Desktop Firefox coverage does not
close #20's device matrix. See [owner-review.md](owner-review.md) for the remaining review.

## Reproduce the actual app

Use a clean isolated checkout of the exact runtime commit, or the later qualification merge only
after confirming its runtime-input digest matches this receipt. Preserve other worktrees. Node 22
matches hosted CI; the local run used Node 24.22.1 and the same lockfile/Chromium 159.0.8154.6.

```sh
rtk npm ci
rtk proxy env E2E_PORT=4386 npm run test:e2e -- --workers=2
rtk npm run lighthouse:ci
rtk proxy node scripts/check-project-paths.mjs
rtk proxy python3 deploy/test_edge_route.py
rtk proxy python3 deploy/test_release_assets.py
rtk npm run preview -- --host 127.0.0.1 --port 4392 --ignore-lock
```

Port 4392 serves the real built app, including its large-name ink hero and opt-in demos. Open it
through T3's environment-port preview when reviewing from another device. It is an isolated local
candidate, not the private preview origin: both hosted portfolio origins still consume main's
deploy artifact. The local preview does not reproduce deployed CSP or authentication headers.
Review `/`, `/projects/`, `/projects/clpr/`, `/case-studies/clpr-search/`, `/resume/`, `/contact/`,
`/desk/` and `/motion/`. Stop only the preview process started for this review.

Production remains on main `ff7ad87cb6d4c958f7feaa49033c8d028f0ca110` at the time of the
read-only [rollback inventory](rollback-inventory.json). See [release-preparation.md](release-preparation.md).
