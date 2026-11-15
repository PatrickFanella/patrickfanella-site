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
