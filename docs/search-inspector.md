# Live search inspector

The desk’s Clpr live mode enhances three HTML sections into Response, SQL and Timing tabs.
Without scripts, the sections explain what live mode will inspect. A live response replaces
the recorded psql display; stopping, retrying or switching to the SQL benchmark hides the
inspector and restores the recorded display. Changing tabs keeps the selected tab across searches.
Arrow keys, Home and End move through the tabs; Tab reaches the selected panel and its content.

Response shows the returned clip titles, HTTP status, the handler’s header map and the complete
JSON body. These are in-process HTTP responses from the pinned Go handler, not requests to clpr.tv.
SQL shows clauses extracted from each captured statement before its full, unchanged SQL and
ordered parameters. It includes prepares as well as executions. Prepared statement names persist
across requests, while each request gets a fresh capture. Text parameters are UTF-8; binary values
are labelled hex bytes because Bind messages alone do not identify their PostgreSQL types.
No SQL or parameter value is inferred from the visitor’s input.

Timing starts immediately before goHandle and ends when its response resolves. Each call to
PGlite’s execProtocolRaw is timed once, even if its input contains multiple statements. Calls
without SQL, such as protocol setup, also count. The sum is time awaiting PostgreSQL bridge
calls, including protocol work and PostgreSQL, rather than PostgreSQL execution time alone.
The remainder includes Go, Gin, pgx, bridge and JavaScript overhead; the page does not assign
that remainder to individual components. Browser clock rounding applies. All timings use
eight fixture clips in this tab and do not claim production latency.

Capture lives in the opt-in worker and does not download PostgreSQL or Clpr on page load.
No wire-message or query-plan panels are added here; those belong to #13. Recorded inspector
output is #16. The existing recorded benchmark remains available before live mode starts.

Checks: npm run build; npx playwright test e2e/clpr.spec.ts e2e/inspector.spec.ts.
The three scripted searches are world record, zzzznomatch and cooking; each checks response,
headers, SQL clauses, parameters and timing totals. Additional checks cover a reused prepared
statement, multiple operations in one timed call, null/binary parameters, sections without
JavaScript, keyboard tabs, a narrow dark viewport, stop/retry and artifact failure.

Visuals use the existing Martian Mono and Big Shoulders Display fonts, desk text/accent/line
colors and square controls. No new shadow, radius or motion tokens are introduced.
