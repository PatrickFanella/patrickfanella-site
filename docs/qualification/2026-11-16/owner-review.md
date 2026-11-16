# Actual-candidate owner review and device handoff

Status: prepared for #73; owner approval of the complete site has not been recorded.
The résumé treatment was selected in the implementation session. That decision concerns the
résumé and does not supply approval of the whole frontend or a production release.

Review the exact qualification merge recorded in #72's completion comment. Its runtime must
match source `1305a08e70b6970360a1cd5e391ea3018b8c04f1` and the adjacent local-artifact receipt.
Use the actual-app preview procedure in [README.md](README.md), with port 4392 in T3's Preview
panel. The existing public/private hosted origins still show main, so they are not this candidate.

Captured actual-app references: [390px light page](images/hero-light-390.png),
[320px dark page](images/hero-dark-320.png). These software-rendered full-page captures support
layout review; use the actual app to judge live ink and interactions.

The owner decision is whether the implemented site retains the desired large-name/live-ink
identity while improving hiring context, evidence and navigation. Inspect these concrete paths:

1. At 320×740 and 390×844, the name and ink remain prominent while role/location, the approximate
   DeliverZero outcome, selected-work action and résumé PDF are readable on the first screen.
2. Check the full-width desktop hero, both themes and reduced motion. Inspect the live ink on the
   owner's actual hardware; the software preview's frame rate is not a hardware result.
3. Follow selected work to Clpr and Undertow. The complete 40-project catalog, dated visuals,
   direct Clpr study link and return anchors should be easy to find.
4. Follow the study's decision links and use the Desk's recorded evidence before opting into a
   live fixture search or generated SQL benchmark. Confirm their evidence labels are clear.
5. Follow Work, Résumé and Contact. Download the one-page PDF and inspect the centered header,
   translucent logo and angled ink; the full web résumé also prints on one page.

Record approval or specific objections in #73, naming the exact candidate SHA. Do not substitute
an agent preference, screenshot review or approval of a different commit. Any runtime change
after that decision requires updated qualification and review.

Issue #20 remains under Epic C. Its required devices/browsers are iPhone Safari, macOS Safari,
Android Chrome and Firefox, on the same qualified candidate. Each result must name the actual
device/browser version, candidate SHA, theme/motion state, routes and limitations. Check `/`,
`/motion/` and `/desk/`, touch stir/button splash, shared header, hiring hero, catalog/Clpr page,
study anchors, résumé/contact and PDF interaction. File each discovered defect separately.

The current session supplied desktop Chromium/Firefox and unavailable-graphics checks. The only
discovered mobile target was an emulator already owned by another session; it was left alone.
Physical phone and macOS Safari results remain unverified. #20 stays open until its actual-device
requirements are met; #74 remains blocked by both #20 and the owner's #73 decision.
