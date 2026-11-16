# Shared navigation

`SiteHeader.astro` renders the same home link, Work (`/projects/`), Résumé (`/resume/`), Contact (`/contact/`) and labeled theme control on landing, content, Desk and Motion pages. Work is the current page on the catalog and the current location on project details; the other primary routes and Home mark only their exact page. Desk retains its pane controls and Alt+1–5 shortcuts. The pane controls hide on stacked layouts; the panes remain in document order.

The header uses the existing font, palette, focus and motion tokens. At phone widths the home text becomes “Home” and the theme label remains available to assistive technology. Controls have at least 44 px targets; the ordinary 320 px layout fits one row. Increased text can wrap instead of being clipped. The theme control appears only after its existing boot handler is installed; navigation remains native HTML without JavaScript.

`boot.ts` measures `[data-site-header]` immediately and through ResizeObserver, updating `--site-header-height`. `--header-clearance` adds 12 px and drives the root's `scroll-padding-top`; new note/section targets can use this shared contract instead of guessing header height. `--bar-h` remains an alias for existing consumers. With JavaScript off the height fallback is 68 px. Pages with their own scroll containers must account for that container separately. Issue #70 owns the case-study note-target follow-up.

The theme continues to use `pf-theme` in localStorage and the existing `data-theme`/OS preference fallback. Page changes and Back use native browser navigation, with no client router.
