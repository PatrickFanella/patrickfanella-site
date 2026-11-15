# Live search inspector

The desk’s Clpr live mode enhances five HTML sections into Response, SQL, Timing, Wire and Plan tabs.
Without scripts, every section contains captured evidence from the committed recording. With
scripts, tabs initially show the same recording. A live response replaces it; stopping, retrying
or failing startup restores the recorded inspector. The SQL benchmark uses its separate, older
recorded display while starting. Changing tabs keeps the selected tab across searches.
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
the selected table size in this tab and do not claim production latency. The initial table has
eight fixture clips; the Plan tab can add generated clips. The request caption records the count.

Wire decodes the actual input and output of each execProtocolRaw call, in order. It shows
Parse, Bind, Describe, Execute and Sync, together with backend replies, per-message byte counts,
per-call totals and expandable raw hex. Counts include the message type and four-byte length
word (the untyped startup message has only its length word). Protocol decoding follows the
[PostgreSQL message formats](https://www.postgresql.org/docs/18/protocol-message-formats.html).
Bind values retain text/binary labels. DataRow reports each column’s byte length; raw values
remain hex because their formats come from RowDescription. These are in-process protocol
messages, not TCP packets. Capture/decoding overhead is outside the measured bridge interval.

Plan uses the captured clip-ranking SELECT and its actual parameters. PostgreSQL’s
ParameterDescription supplies the OIDs needed to decode binary integer parameters for EXPLAIN;
an unsupported binary type produces an explicit unavailable message instead of guessed values.
It runs EXPLAIN (ANALYZE, FORMAT JSON) three times: with normal planner settings, with index and
bitmap scans discouraged for the sequential alternative, and with sequential and ordinary
index scans discouraged for the GIN bitmap alternative. Switches are SET LOCAL inside separate
transactions, so they do not change later handler requests. Disabling ordinary index scans
still permits bitmap scans of B-tree indexes. To isolate GIN, that alternative temporarily
drops competing, non-constraint clip indexes in its transaction, then explicitly rolls it back.
Rollback restores those indexes without rebuilding them; normal searches retain the full
migrated schema. This counterfactual is disclosed beside the costs. The alternatives must contain a
sequential scan and idx_clips_search_vector respectively, or comparison is marked unavailable.
These extra executions happen after capture ends and are excluded from handler/bridge timings.

The size control offers 8, 1,008, 10,008, 30,008 and 50,008 clips. The eight labelled fixtures
remain; the extra rows are deterministic generated titles, not production data. Every resize
deletes/replaces only generated rows, runs VACUUM FULL clips outside a transaction, then
ANALYZE clips. This rewrites the table and indexes and refreshes statistics after both growth
and shrink. The worker serializes resizing, handler requests and plan comparisons. The handler
re-runs the current search after resizing, keeping Response, SQL, Wire and Timing consistent
with the selected size. Stop cancels the worker; retry starts again with eight fixtures.

The chart plots both alternatives’ root Total Cost, with row count on a logarithmic x axis
and cost on a linear y axis. Solid/dashed lines, an accessible chart description and a table
keep the series readable without relying on color. A point is added for each measured size;
revisiting a size replaces its point and changing the query clears the series. The explanation
uses those recorded costs to bracket the first sampled crossover. PostgreSQL costs are estimates
in arbitrary units, not milliseconds or a universal production crossover. The default plan and
both alternatives retain complete JSON and separately labelled execution times, subject to
browser clock rounding. There is no new animation.

Capture lives in the opt-in worker and does not download PostgreSQL or Clpr on page load.
The recorded chart covers all five sizes. Live searches start a fresh series. See
[the recording procedure and budget gate](clpr-recording.md) for the CI artifact, source hashes,
memory method and live-mode limits. The older recorded benchmark belongs to the SQL-only mode.

Checks: npm run build; npx playwright test e2e/clpr.spec.ts e2e/inspector.spec.ts e2e/plans-wire.spec.ts.
The three scripted searches are world record, zzzznomatch and cooking; each checks response,
headers, SQL clauses, parameters and timing totals. Additional checks cover a reused prepared
statement, multiple operations in one timed call, null/binary parameters, sections without
JavaScript, keyboard tabs, a narrow dark viewport, stop/retry and artifact failure. Wire checks
cover frame bounds, directional message names, UTF-8 byte lengths, unknown messages, reply
totals and prepared-statement parameter OIDs. The live plan test measures all five sizes,
checks sequential/GIN choices and costs, shrinks back to eight, changes the search, and checks
accessibility and narrow layout.

Visuals use the existing Martian Mono and Big Shoulders Display fonts, desk text/accent/line
colors and square controls. No new shadow, radius or motion tokens are introduced.
