# Desk telemetry

The log records the fonts, actual ink backend, worker module start, PostgreSQL initialization,
schema, generated seed, GIN index and both benchmark completions. Times are milliseconds since
navigation; worker timestamps use `performance.timeOrigin + performance.now()` and are translated
to the page origin. Each entry also creates a `desk:` mark in the Performance panel.

The process pane refreshes every second. Frame rate and frame interval come from the ink engine;
CPU submit is its measured CPU wall time per step/draw, not GPU completion time. Reduced motion,
a hidden tab and an unavailable GPU explicitly show no drawing. PostgreSQL reports its version,
actual clip count, `pg_database_size(current_database())`, and SQL statement count. The statement
count includes benchmark EXPLAIN executions and the once-per-second database-size query itself.
No process activity is simulated. The clips remain labeled generated data.

Checks: build and `npx playwright test e2e/telemetry.spec.ts`. Startup entries expose `data-ms`
for comparison with their Performance marks; this is measurement rather than a decorative clock.
