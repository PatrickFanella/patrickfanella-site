# Spike #7: how content pages are generated

Evidence only. This branch is not meant to merge. The decision is recorded on issue #7.

Two throwaway prototypes build the same 41 pages (`/projects/` and one page per project in `content/portfolio.json`, copied from `subculture-collective/patrickfanella-co` `db/seed/portfolio.json` on main, 2026-11-14), plus `/` and `/motion/`:

- **(a) Vite build script.** `scripts/build-pages.mjs` writes `projects/**/index.html` from string templates; `vite.config.ts` adds them as inputs. `npm run build` at the repository root.
- **(b) Astro 7.4.12.** `spike/astro/`: one layout, two page files, and `/` and `/motion/` copied from the existing HTML with one line changed each. `cd spike/astro && npm install && npm run build`.

Both import the existing modules unchanged: `src/project-page.ts` boots the ink and pours the heading; `src/styles/project.css` is shared.

`evidence/` holds the measurement scripts (`tools/`), the view-transition logs (`vt-*.jsonl`), screenshots and one built project page from each prototype.
