# Clpr search on the desk

Issue #11 loads Clpr's real Go handler and repository into a dedicated worker, with
pgx connected to PGlite through the artifact's wire-protocol bridge. The worker
applies every bundled up migration and creates the same eight labelled fixture
clips as the prototype. No search request leaves the tab.

The checked-in `public/clpr/manifest.json` identifies the exact source commit,
source date, Go version, build tags, file sizes and hashes, and CI run. The matching
payload lives under `public/clpr/<commit>/`. The desk displays those manifest values
and links the source and CI run. An artifact built locally is labelled “Built
outside Clpr CI.” The pinned build is copied from Clpr CI; this site never compiles Go.

To update the pin, download a `search-wasm-<full commit>` release from
`subculture-collective/clpr` into an empty directory, then run the importer with that
directory as its argument. The importer validates every file, the decompressed Wasm,
the size budget and migration ordering before changing the pin. It rejects a dirty
source build. Remove the superseded commit directory only after the new pin passes
the browser checks and is ready to commit.

The site build is entirely offline after `npm ci`: it consumes the checked-in
artifact. It does not depend on GitHub being reachable during a visitor's session.
Both workers and their large dependencies load only after an explicit button click.

Clpr live mode runs its PostgreSQL search path on eight fixture clips. It does not
run OpenSearch or embeddings. `search world record` returns the prototype's two
ranked clips. The psql pane shows Clpr's HTTP status and JSON; its measured request
time includes Go, pgx and PostgreSQL. The separate SQL benchmark retains the
50,008-row index comparison and reports query times. Inspector panels and detailed
SQL/wire capture belong to later issues.

Stop live mode terminates its worker and rejects pending requests. Failed downloads,
integrity checks, migrations or runtime startup leave the recorded benchmark visible
and allow retry. Slow downloads stay cancellable and are not treated as failures.

Validation: `npm run build`, then `npx playwright test`. The Clpr tests cover deferred
downloads, manifest provenance, all migrations, real handler responses, no matches,
corrupt payload recovery and cancelling startup. Clpr's own workflow also runs the
released payload against PGlite. These checks do not establish complete native API
parity, Firefox/Safari support, or a production deployment.
