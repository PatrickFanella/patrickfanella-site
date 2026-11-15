# Production deployment and rollback

The owner requested the production cutover on 2026-11-15. Issue #20's physical iPhone Safari, macOS Safari and Android Chrome checks remain separate qualification work. Headless Chromium, Firefox and Lighthouse cannot supply those results.

## Ownership and release flow

Almaz owns ingress for `patrickfanella.co`. Its edge Caddy routes the frontend to `patrickfanella-site:8080` on the existing `management` Docker network. `/api/*` continues to use the existing NUC API at `10.0.0.56:3017`; this deployment does not migrate its database or change its image.

`deploy/compose.yml` defines the static origin under `/opt/server/projects/patrickfanella-site` on Almaz. It pins Caddy by image digest, publishes no host port and serves a read-only release directory. The private preview remains a separate container and keeps Authelia and `noindex`.

The main CI pipeline records Clpr, builds once, tests that artifact and publishes it to the `deploy` branch. `/REVISION` identifies the source commit. The production updater uses the existing read-only GitHub deploy key and atomically changes `site-data/current` after checking the release. It retains five releases plus the current and previous selections. `patrickfanella-site-update.timer` checks once a minute. Disable that timer before selecting an older release, or it will select the latest tested build again.

Before switching pages, the updater publishes hashed Astro bundles and commit-pinned Clpr payloads into `site-data/assets`. Caddy serves those URLs from this shared store, so an older open desk can still start its lazy worker after a deployment or release pruning. Publishing refuses different bytes at an existing immutable URL. The automatic updater never prunes this store; it is intentional retained compatibility data. HTML, `/clpr/manifest.json` and the recording build metadata always come from the current release with `no-cache`. CI exercises an actual Caddy container across a release switch and removal of the old release directory.

## First activation

Run commands from this repository on Kvant with the normal host aliases. Qualify the exact source commit in hosted CI before activating it. Install `deploy/` into the Almaz project directory owned by `onnwee` (UID/GID 1000); never copy a local build into production. Install the two systemd units into `/etc/systemd/system`, then run `systemctl daemon-reload`.

From a clean checkout of the qualified source, install the deployment files and inactive timer:

```sh
rtk proxy ssh almaz 'rtk proxy mkdir -p /opt/server/projects/patrickfanella-site'
rtk proxy scp deploy/compose.yml deploy/origin.Caddyfile deploy/update.py deploy/edge-route.py deploy/rollback.py deploy/patrickfanella-site-update.service deploy/patrickfanella-site-update.timer almaz:/opt/server/projects/patrickfanella-site/
rtk proxy ssh almaz 'rtk proxy sudo -n install -m 0644 /opt/server/projects/patrickfanella-site/patrickfanella-site-update.service /opt/server/projects/patrickfanella-site/patrickfanella-site-update.timer /etc/systemd/system/'
rtk proxy ssh almaz 'rtk proxy sudo -n systemctl daemon-reload'
```

1. Run `python3 update.py --expected-source` with the qualified 40-character source SHA from inside the Almaz project directory, as `onnwee`.
2. Run `docker compose up -d` there. Check the container's health and read its `/REVISION` from the edge container over the Docker network.
3. Run `sudo -n python3 edge-route.py apply --expected-source` with that same SHA and `--dry-run`. This validates a candidate configuration without changing ingress.
4. Repeat the command without `--dry-run`. It changes only the portfolio's frontend upstream and CSP. It preserves the API handler and unrelated hosts, retains the bind-mounted config's inode, validates the full candidate before reload, and refuses a changed portfolio block. Saved host blocks and private receipts live in `rollback/` on Almaz.
5. Run `npm run check:live -- https://patrickfanella.co --revision=` followed immediately by the exact source SHA. The script checks all ten old sitemap URLs, the desk, motion, case study, PDF, indexing headers, CSP and the public build revision.
6. Dispatch the **Verify production** GitHub workflow with that exact source SHA. It repeats the live route check and mobile Lighthouse on `/`, `/projects/`, `/resume/`, `/contact/` and `/desk/`. Inspect the run's uploaded JSON reports. Required scores: performance ≥0.90; accessibility, best practices and SEO ≥0.95; CLS ≤0.05. Lighthouse uses its default mobile throttling and Chrome's default graphics configuration; it does not force SwiftShader. Each summary records graphics devices and whether the audited page used the static ink fallback. Headless Chrome without a GPU uses that fallback. The functional Playwright suite separately exercises SwiftShader. These audits do not qualify physical-device ink performance.
7. After public verification, stop the retained NUC container `patrickfanella-web` and disable only the old repository's **Deploy** workflow (`subculture-collective/patrickfanella-co`, workflow ID `413851709`). That workflow deploys web and API together, so disabling it also pauses automatic API deployments; the running API is unchanged. Keep its Compose release, receiver configuration, image and container. Enable the new production update timer.

The legacy frontend's retained image is `fleet-deploy/patrickfanella-co/web:9ed782785c7366b04bf0c626b39f8a6fcf1e3b54`, image ID `sha256:370a998a0760e8bf007947c14f09f57376b472b0e0474a237df879614858afa6`. Its original restart policy is `unless-stopped`. Do not prune the container or image while this rollback remains required.

## One-command rollback

From this repository on Kvant:

```sh
rtk proxy python3 deploy/rollback.py
```

The command disables the new update timer, starts the retained NUC frontend, restores only the saved portfolio host block on Almaz, reloads Caddy and requires a public HTTP 200 whose HTML hash matches the legacy origin captured at cutover. Other hosts, the API and database remain outside the operation. The old paired deployment workflow stays paused: re-enable it only when intentionally resuming deployments from that repository.

For rollback to an earlier **new-site** build, disable the production timer first and atomically select the retained `site-data/releases/` directory on Almaz. Confirm its `REVISION` and public route checks before re-enabling automatic updates.
