# Résumé page

`src/content/resume.json` retains the editable résumé facts and records the portfolio source commit
and PDF hash. Profile, skills and engineering bullets come from its `docs/resume-content.json`;
roles, dates, contact details and other experience are transcribed from the existing PDF at that
same commit. The PDF is copied unchanged, served at `/assets/patrick_fanella_resume.pdf` and linked
with a download filename. Do not invent dates when updating these sources.

`/resume/` renders without JavaScript. Fonts and CSS load statically; the optional Print résumé
button uses a bundled event listener allowed by the site's CSP. The print stylesheet removes the
navigation and ink, uses letter paper with 0.4-inch margins, and fits the full experience on one letter page.

Checks: `npm run build`; `npx playwright test e2e/resume.spec.ts` compares the served PDF hash,
checks the source roles and dates, renders print output, and checks mobile layout and accessibility.

The owner resolved recruiting contact issue #58 by retaining `resume.json`'s email.
`src/content/contact.ts` exposes that value to the home/contact pages, shared footer,
Motion, Desk and Desk shell; the imported source data and original PDF bytes remain intact.
The web résumé places the existing approximate DeliverZero outcome before the skills
inventory and provides `/resume/#deliverzero` as a stable employment anchor. #67 owns
the later branded PDF export and its separate artifact provenance.


## Generated compact download (#67)

The owner selected a centered name/contact header with left-aligned body text on November 16, 2026.
The PDF uses the solid PF at 40% opacity and the approved ink scene at 20% opacity in a vertically
compressed band about one-third down the page, tilted nine degrees with the right side higher.
The artwork extends past both page edges; content
margins remain unchanged. The web résumé uses the same centered header/contact alignment.
Both selected SVGs are input-hashed in the PDF receipt. This presentation change does not change
résumé facts or the imported source record.

`npm run render:resume` renders the one-page download from maintained `src/content/resume.json`, the shared recruiting contact, the selected solid PF and the installed self-hosted display/body font bytes. It uses the lockfile's Playwright Chromium. The subset keeps profile/skills, the first three bullets of each engineering role and Retail Data Systems; the fuller web résumé and its one-or-two-page print layout remain available. No unsupported facts or new employment measurements are added.

`src/content/resume-artifact.json` records the generated PDF hash, renderer/browser version and input hashes. `resume.json` retains the original imported PDF path/commit/hash; that historical source hash is not the replacement download hash. Chromium date and document ID metadata are normalized at equal byte lengths for reproducibility on the same browser. Build checks reject stale source inputs or altered artifact bytes. After a browser/toolchain upgrade, regenerate twice, compare bytes, render the page and review the new receipt.

Validation: render twice with `npm run render:resume`, inspect `pdfinfo`, extract facts with `pdftotext`, render with `pdftoppm -png`, and run `npx playwright test e2e/resume.spec.ts`. Browser checks exercise a real download event, advertised filename, served/downloaded hash and the separate full web print contract.
