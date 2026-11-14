# site

The rebuild of patrickfanella.co, started 2026-11-14. It lives beside the current React site in `web/` and is not deployed yet.

Two static pages so far:

- `/` explains what is coming. The ink behind it is a fluid simulation that pours from the letters of the name.
- `/motion/` shows each animation in the motion set on its own, with its timing and its reduced-motion version.

```bash
npm ci
npm run dev        # http://localhost:5173
npm run build      # typecheck, then build to dist/
npm run preview
```

## Layout

- `src/ink/shaders.ts`: stable fluids (advection, vorticity confinement, buoyancy, Jacobi pressure solve) in WebGL2 fragment shaders, plus the two looks: pigment on paper (light) and ink that glows (dark).
- `src/ink/mask.ts`: draws the page into the solver's mask. Letters marked `data-ink-letter` are solid and pour from their feet once they carry `data-pour`. Elements marked `data-ink-solid` are solid rectangles.
- `src/ink/engine.ts`: the frame loop and the API the pages use: `setEmitters`, `burst`, `stir`, `setTheme`, `preroll`.
- `src/motion/motion.ts`: the motion set. Pour-in, bleed, splash, stir, unfold and fitting the name to the width.
- `src/boot.ts`: start-up shared by both pages: fonts, theme switch, ink, readout.
- `src/styles/site.css`: tokens (colour, type, four durations, two curves), layout, rise, view transitions and reduced motion.

## Motion set

| Name | Trigger | Timing |
|---|---|---|
| Pour-in | Page load | 620 ms per letter, 60 ms apart, spring curve; ink splashes as each letter hits |
| Bleed | Hover or keyboard focus on `data-bleed` | in over 240 ms, out over 400 ms |
| Splash | Press on `data-splash` (pointer, Enter, Space) | one solver step |
| Stir | Pointer movement, scrolling | continuous |
| Rise | Scrolling a `data-rise` element into view | CSS scroll-driven animation |
| Unfold | Opening a `details[data-unfold]` | 420 ms view transition |
| Hand-over | Following a link between pages | 620 ms cross-document view transition |
| Theme switch | The switch in the top bar | 420 ms view transition |
| Focus | Tab, Shift+Tab | 240 ms |

With `prefers-reduced-motion: reduce`, the solver runs ahead and the page shows one still frame, letters start in place, and transitions and view transitions are off. Without WebGL2 the page falls back to a static wash in the same three inks.

## Deployment notes for later

The production edge CSP in `deploy/caddy/patrickfanella.caddy` already allows everything this needs (`script-src 'self'`, `font-src 'self'`, inline styles): fonts are self-hosted and there are no workers or third-party scripts.
