# Gated frontend release preparation

Prepared for #74; no release PR, main merge or production activation was performed here.
The qualification, owner and physical-device records remain distinct. The release requires a
recorded owner-approved head and completed relevant #20 evidence before delivery to main.

The existing CI deploy condition publishes only a successful push to main. Keep that condition
and use the tested artifact; do not copy a local build or broaden publication to the integration
branch. The private preview consumes the same main artifact as production and is not a separate
candidate staging lane. API, database, ingress for other services and the retained legacy frontend
are outside this routine visual release.

## Verified preparation

Read-only Almaz inventory on November 16 found:

- Root: `/opt/server/projects/patrickfanella-site/site-data`.
- Current release: `releases/492e47eebe84608bee80d886aa17c0411c2a06ba`.
- Source revision: `ff7ad87cb6d4c958f7feaa49033c8d028f0ca110`.
- No `previous` selection yet; the updater will retain the current selection before a new swap.
- Shared immutable-asset directory exists.

The isolated edge-route and immutable-asset tests passed. This does not prove that a future
activation or rollback has been exercised. Re-read these paths and revisions before release;
another authorized release may change the recovery target.

## After the gates are recorded

Confirm #72's exact qualified integration head, #73's owner decision and #20's device matrix all
refer to the same runtime. Prepare the sole integration-to-main release PR with those records and
current exact-head checks. If main advanced, qualify the actual resulting release candidate before
merging. Re-read the head, base, passing checks and conflict state immediately before the guarded
merge. Record the actual main merge SHA, rather than assuming it equals the integration head.

Main CI records Clpr, builds/tests once and pushes the tested deploy artifact. Read back the
published artifact identity and both hosted origins' `/REVISION` after the Almaz updater activates
it. From a clean checkout of that exact released source, run:

```sh
release_sha=$(rtk proxy git rev-parse HEAD)
rtk npm run check:live -- https://patrickfanella.co --revision="$release_sha"
rtk proxy gh workflow run verify-production.yml --repo PatrickFanella/patrickfanella-site -f source_revision="$release_sha"
```

Read back that Verify production run's exact head and results. Separately compare the public
selected-brand bytes with `brand-assets-provenance.json` and the public PDF with
`resume-artifact.json`; verify page-specific social metadata, contact links, the catalog/detail
study paths, and normal live ink in the owner's real browser. The earlier headless audit cannot
establish that post-activation behavior.

## Routine new-site rollback

Use the retained **new-site** release and shared immutable assets. The legacy cutover command
`deploy/rollback.py` restores the older frontend and is not this routine visual rollback.

Before rollback, re-read current/previous selections and preserve the release being replaced.
Disable `patrickfanella-site-update.timer` on Almaz so it cannot immediately select the newest
deploy branch again. Validate the retained release's REVISION and required files, atomically
select it through a temporary symlink in `site-data`, then run public route/revision/hash checks
for that source. Keep `site-data/assets` intact so open tabs can load older hashed worker assets.
Do not restart or replace API/database containers. Re-enable automatic updates only after the
owner chooses whether the newest deploy artifact should be selected again.

At this preparation snapshot, the recovery source is `ff7ad87cb6d4c958f7feaa49033c8d028f0ca110`
in release `492e47eebe84608bee80d886aa17c0411c2a06ba`. These are observed recovery inputs,
not permission to change a later production state without checking it again.
