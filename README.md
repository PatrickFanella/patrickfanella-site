# patrickfanella-site

The rebuild of patrickfanella.co, started 2026-11-14. It is not deployed yet; the live site still comes from `subculture-collective/patrickfanella-co`. What is planned and in what order: [docs/plan.md](docs/plan.md) and the pinned roadmap issue.

Two static pages so far:

- `/` explains what is coming. The ink behind it is a fluid simulation that pours from the letters of the name.
- `/motion/` shows each animation in the motion set on its own, with its timing and its reduced-motion version.

```bash
npm ci
npm run dev        # http://localhost:5173
npm run build      # typecheck, then build to dist/
npm run preview
npm run test:e2e   # build, serve dist/ and run the browser tests in headless Chromium
```

The browser tests in `e2e/` use Playwright. Install its Chromium once with `npx playwright install chromium`. They check that the name pours in and fits the width, that reduced motion gives a still frame, that the page works without WebGL2, and that axe finds no accessibility violations on either page in either theme. Chromium runs WebGL2 on the CPU through SwiftShader, so the tests behave the same with or without a GPU. They do not compare screenshots of the ink, which differ between GPUs. Set `E2E_PORT` to serve on a port other than 4173.

CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run build` and the browser tests on every push and pull request.

## Layout

- `src/ink/shaders.ts`: stable fluids (advection, vorticity confinement, buoyancy, Jacobi pressure solve) in WebGL2 fragment shaders, plus the two looks: pigment on paper (light) and ink that glows (dark).
- `src/ink/mask.ts`: draws the page into the solver's mask. Letters marked `data-ink-letter` are solid and pour from their feet once they carry `data-pour`. Elements marked `data-ink-solid` are solid rectangles.
- `src/ink/engine.ts`: the frame loop and the API the pages use: `setEmitters`, `burst`, `stir`, `setTheme`, `preroll`. Up to four bursts run at once, each with a direction, spread and length.
- `src/motion/motion.ts`: the motion set. Pour-in, bleed, splash, stir, unfold and fitting the name to the width.
- `src/boot.ts`: start-up shared by both pages: fonts, theme switch, ink, readout.
- `src/styles/site.css`: tokens (colour, type, four durations, two curves), layout, rise, view transitions and reduced motion.
- `docs/`: the plan, the original design doc and the prototypes the roadmap builds from.

## Motion set

| Name | Trigger | Timing |
|---|---|---|
| Pour-in | Page load | 620 ms per letter, 60 ms apart, spring curve; ink splashes down as each letter hits |
| Bleed | Hover or keyboard focus on `data-bleed` | in over 240 ms, out over 400 ms |
| Splash | Press on `data-splash` (pointer, Enter, Space) | one solver step |
| Stir | Pointer movement, scrolling | continuous |
| Rise | Scrolling a `data-rise` element into view | CSS scroll-driven animation |
| Unfold | Opening a `details[data-unfold]` | 420 ms view transition |
| Hand-over | Following a link between pages | 620 ms cross-document view transition |
| Theme switch | The switch in the top bar | 420 ms view transition |
| Focus | Tab, Shift+Tab | 240 ms |

With `prefers-reduced-motion: reduce`, the solver runs ahead and the page shows one still frame, letters start in place, and transitions and view transitions are off. Without WebGL2 the page falls back to a static wash in the same three inks.

## Licence

GPL-3.0-or-later, as in the repository it came from. See [LICENSE](LICENSE).
