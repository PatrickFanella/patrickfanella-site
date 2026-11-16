# Desk commands

`/desk/` accepts `help`, `projects`, `resume`, `contact` and `search <words>`.
Up and Down recall the session history and restore an unfinished command. Each completed command
appends one response to a polite live log. Input and database results are inserted as text.

Search retains the PostgreSQL worker after its startup comparison. Words become prefix terms joined
with AND and are bound as parameters to the existing moderation-filtered search and count queries.
The psql pane shows the same query, indexed plan, match count and rows. The initial no-index comparison
is hidden for subsequent searches because its measurements belong to the original query.
The reported time is the mean PostgreSQL execution time of a 50 ms batch; it excludes the separate
count query and worker messaging, and is displayed at the measured clock resolution.

A search before startup finishes asks the visitor to retry. A failed worker is reported as unavailable;
recorded benchmark rows never answer a visitor search. Requests are serialized and errors reject the
pending command. Leaving the page frees the worker, except when the page enters the back-forward cache.

Checks: `npm run build` and `npx playwright test e2e/shell.spec.ts`.

The visible mode status follows committed output: the SQL controller reports progress,
completion, search/no-match results, failure and cancellation through a typed callback.
The Stop control names the active SQL benchmark or Clpr live mode. A completed SQL worker
remains available for shell searches; a failed search can be retried without relabeling
recorded evidence as live. Status copy distinguishes direct SQL over generated clips from
Clpr's Go handler over fixtures (and any explicitly added generated clips).

Each worker callback checks that its worker is still current before changing output or
status. Switching, stopping and retrying terminate the previous worker and reject its
pending requests. `e2e/desk-status.spec.ts` injects deterministic controller-boundary events
for terminal and stale-callback regressions; those fixture times are not performance proof.
`e2e/desk.spec.ts` also asserts completion after a real PostgreSQL benchmark, while
`e2e/clpr.spec.ts` exercises the actual pinned Go worker, integrity failure and retry.
