# Résumé page

`src/content/resume.json` retains the editable résumé facts and records the portfolio source commit
and PDF hash. Profile, skills and engineering bullets come from its `docs/resume-content.json`;
roles, dates, contact details and other experience are transcribed from the existing PDF at that
same commit. The PDF is copied unchanged, served at `/assets/patrick_fanella_resume.pdf` and linked
with a download filename. Do not invent dates when updating these sources.

`/resume/` renders without JavaScript. Fonts and CSS load statically; the optional Print résumé
button uses a bundled event listener allowed by the site's CSP. The print stylesheet removes the
navigation and ink, uses letter paper with half-inch margins, and fits the checked content on one letter page (the contract permits two).

Checks: `npm run build`; `npx playwright test e2e/resume.spec.ts` compares the served PDF hash,
checks the source roles and dates, renders print output, and checks mobile layout and accessibility.

The owner resolved recruiting contact issue #58 by retaining `resume.json`'s email.
`src/content/contact.ts` exposes that value to the home/contact pages, shared footer,
Motion, Desk and Desk shell; the imported source data and original PDF bytes remain intact.
The web résumé places the existing approximate DeliverZero outcome before the skills
inventory and provides `/resume/#deliverzero` as a stable employment anchor. #67 owns
the later branded PDF export and its separate artifact provenance.
