# Frontend and brand candidate preview

`portfolio/frontend-brand-integration` is the integration base for roadmap #1's frontend and Ink in Motion work. It started at qualified main `ff7ad87cb6d4c958f7feaa49033c8d028f0ca110`: [CI](https://github.com/PatrickFanella/patrickfanella-site/actions/runs/43698612718) and [production verification](https://github.com/PatrickFanella/patrickfanella-site/actions/runs/43700516113) passed. These historical runs qualify that starting commit, not later candidate changes or physical devices.

Implementation PRs target this branch. Only the final release PR (#74), after the candidate checks (#72), owner review (#73) and device gate (#20), targets `main`. Merging or pushing to `main` publishes production automatically.

## Build an exact candidate

Run from a clean repository checkout on Kvant. First inspect the current path, remotes and worktrees; preserve other work. These commands resolve the remote candidate once, print its full SHA, then create a separate detached review checkout. Record the printed SHA with the review results. Node 22 and the lockfile match CI.

```sh
rtk git status --short --branch
rtk git remote -v
rtk git worktree list
rtk git fetch origin portfolio/frontend-brand-integration
candidate_sha=$(rtk proxy git rev-parse FETCH_HEAD)
rtk proxy printf '%s\n' "$candidate_sha"
review_dir=$(rtk proxy mktemp -d /tmp/patrick-candidate.XXXXXXXX)
rtk git worktree add --detach "$review_dir" "$candidate_sha"
cd "$review_dir"
rtk npm ci
rtk npm run build
rtk proxy git rev-parse HEAD
rtk npm run preview -- --host 127.0.0.1 --port 4321 --ignore-lock
```

The last command runs the real built Astro app in the foreground. `--ignore-lock` prevents Astro from detaching under an agent harness. Keep this terminal open and stop this process with Ctrl+C when finished. If port 4321 is occupied, choose a free port and record the changed URL; do not reuse or stop another session's server. Astro can select another port, so confirm its startup URL.

Review http://127.0.0.1:4321/ and the native routes `/projects/`, `/projects/clpr/`, `/resume/`, `/contact/`, `/case-studies/clpr-search/` and `/desk/`. This is the application with its large name, live ink, both renderer paths and opt-in heavy demos. Test both themes and reduced motion; no-JS and unavailable-GPU paths must remain usable. Resized desktop Chromium does not satisfy #20's real-device checks.

The local static preview does not provide the deployed origin's CSP, Authelia or `/REVISION` file: CI adds `REVISION` only in the main-only deploy job. Bind local evidence to `git rev-parse HEAD`, a clean tracked diff and the successful build, not to a fabricated release marker. A fresh local build validates the committed recorded evidence; hosted CI records Clpr again and tests that resulting artifact. Local ink output depends on available graphics hardware.

## Qualify and integrate a PR

Open each site PR with base `portfolio/frontend-brand-integration` and its issue's closing reference. CI runs on every `pull_request`, including this base, and can also run through `workflow_dispatch`. A dispatch can qualify an integration head after merge without publication:

```sh
rtk proxy gh workflow run ci.yml --repo PatrickFanella/patrickfanella-site --ref portfolio/frontend-brand-integration
```

Read back the workflow run's full `headSha`, conclusion and job results; a green run from another head is not evidence. PR Actions checks use GitHub's test merge with the current base. Record both the PR head SHA and the CI merge SHA. Before merging, read back the base, current head, passing checks and conflict state. Review the diff so unrelated changes do not enter the candidate. The eventual release qualification separately tests the exact combined integration head in #72.

GitHub may leave `Closes #59` and other closing references open when a PR merges into a non-default branch. After the merge, read back the PR's merged state, base and head, confirm passing head checks, then comment on and close only its completed issue. Record the PR URL, tested head, CI run and merge commit. Read the issue back after closing; update roadmap/epic checkboxes without closing trackers with unfinished children.

## Publication boundary

The existing `.github/workflows/ci.yml` deploy condition stays:

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Candidate pushes, candidate PRs and manual CI dispatches cannot publish through that job. Do not change this guard to obtain a preview. The existing https://pf-preview.subcult.tv private address and https://patrickfanella.co production address both consume the same tested `deploy` artifact from main; the private address is not a candidate staging lane. This work adds no hosting and changes no updater, ingress or service.

When a review ends, stop only its foreground preview, leave the owning checkout with `cd -`, and remove only that review worktree after checking it is clean. Keep any recorded results needed for #72. Source changes, local preview, CI, integration, owner review and public release are separate evidence.
