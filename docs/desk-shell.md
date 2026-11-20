# Desk commands

`/desk/` accepts `help`, `projects`, `resume`, `contact` and `search <words>`.
Up and Down recall the session history and restore an unfinished command. Each completed command
appends one response to a polite live log. Input and database results are inserted as text.

`projects` lists the featured projects by product name and tagline. The page writes that reply into
the form's `data-projects-reply` from the project catalog at build, so it follows the featured set
and the catalog's JSON stays out of the client bundle.

Search retains the PostgreSQL worker after its startup comparison. Words become prefix terms joined
with AND and are bound as parameters to the existing moderation-filtered search and count queries.
The psql pane shows the same query, indexed plan, match count and rows. The initial no-index comparison
is hidden for subsequent searches because its measurements belong to the original query.
The reported time is the mean PostgreSQL execution time of a 50 ms batch; it excludes the separate
count query and worker messaging, and is displayed at the measured clock resolution.

A search before startup finishes asks the visitor to retry. A failed worker is reported as unavailable;
recorded benchmark rows never answer a visitor search. Requests are serialized and errors reject the
pending command. Leaving the page frees the worker, except when the page enters the back-forward cache.

Checks: `npm run test:unit`, `npm run build` and `npx playwright test e2e/shell.spec.ts e2e/desk-status.spec.ts`.

## Pane modes

`src/desk/pane-modes.ts` owns which mode the psql pane is in, what that mode's worker is doing, the
status copy and which worker replies still count. It has no DOM: `src/desk/psql.ts` passes in the two
worker factories and a render function, and writes each view to the page. `psql.ts` is the only place
that shows or hides the psql text, the timing panel and the inspector, from the view's mode: the SQL
benchmark has the text and the panel; the recorded run and Clpr live mode have the inspector.

| Mode | Phase | Entered by | Status line |
| --- | --- | --- | --- |
| recorded | idle | page load | Recorded evidence below… (or why live mode is off) |
| recorded | idle | Stop | SQL benchmark stopped… / Live mode stopped… |
| benchmark | starting | Run SQL benchmark | Running the SQL benchmark…, then one `SQL benchmark: …` line per worker step |
| benchmark | slow | 30 s without PostgreSQL | SQL benchmark: PostgreSQL is still loading in this tab… |
| benchmark | live | the indexed measurement | SQL benchmark complete…; per search: Running a direct SQL search…, SQL search complete: n matches…, SQL search failed… |
| benchmark | failed | error event, worker error or no worker | SQL benchmark failed. These are recorded times… |
| clpr | starting | Start Clpr live mode or the example | Downloading the pinned Clpr build…, the worker's progress lines; after 30 s: Clpr is still loading… |
| clpr | live | the worker's ready event | Running Clpr’s Go search handler…, Clpr search complete: n matches…, Clpr search failed… |
| clpr | failed | error event, worker error, no worker or a failed first search | Clpr could not run in this tab… |

One worker runs at a time. Starting either mode, stopping and failing all terminate the current
worker and reject its pending searches ("The SQL benchmark stopped.", "Clpr live mode stopped.",
"PostgreSQL is unavailable in this tab."); leaving the page rejects a pending SQL search with
"The desk was closed." and a pending Clpr search with "Clpr live mode stopped.".
A callback from a worker that is no longer current changes nothing, and neither does a reply nobody
is waiting for. Request numbers carry on across restarts. Until the SQL benchmark's indexed
measurement arrives, the pane shows the recorded times, and progress replaces only the last line of
the psql text. A completed SQL worker stays for shell searches; a failed search can be retried. In
Clpr live mode only the latest search is shown in the inspector; an earlier one still answers its
caller. The Stop control names the active mode and is enabled while a worker is starting or live.
Status copy distinguishes direct SQL over generated clips from Clpr's Go handler over fixtures (and
any explicitly added generated clips).

`src/desk/pane-modes.test.ts` covers all of this directly with fixture workers.
`e2e/desk-status.spec.ts` keeps what needs a page: that a view reaches the controls, the psql text,
the inspector and the shell; its fixture times are not performance proof.
`e2e/desk.spec.ts` also asserts completion after a real PostgreSQL benchmark, and that each
figure is the median of its three batch means; how a time is rounded to the clock, how the plan
is tidied and what the ratio sentence says are tested directly in `src/desk/benchmark.test.ts`, while
`e2e/clpr.spec.ts` exercises the actual pinned Go worker, integrity failure and retry.
