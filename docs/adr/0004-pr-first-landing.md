# PR-first landing for `main`

Every change to this fork's `main` enters through a pull request; direct pushes to `main` are disallowed (except the documented `pull_request` bypass for the repository admin, which exists as an escape hatch for when CI is broken, not as the normal path). This supersedes ADR-0001 in full: there is no "fork-local changes go straight to `main`" lane and no separate review-free path.

Upstream `doocs/md` changes still arrive through a sync pull request created by `sync-upstream.yml`. Today that PR is merged with a **squash** (matching the single merge method `main` allows); the option of landing it as a merge commit to preserve upstream ancestry is tracked separately in issue #34 and explicitly deferred.

## Status

Supersedes: [0001-fork-local-workflow.md](./0001-fork-local-workflow.md)

## Consequences

- Every push to `main` is still a release candidate, but now every such push is the result of a reviewed pull request; the human review replaces the review latency that the direct-push lane previously skipped.
- The ruleset `Protect main (PR + status checks)` is the enforcement point: `allowed_merge_methods` is `["squash"]`, required status checks are `lint`, `type-check`, `test`, `build`, and the admin bypass is `pull_request` mode.
- The sync PR is created with `GITHUB_TOKEN`, so it carries no checks; its landing relies on the admin `pull_request` bypass after the human reviews the diff. Verification evidence is the `verify` and unit-test output recorded in the sync workflow, not a check on the PR.
- `md-web-cli` and the other fork-owned packages are ordinary repository content now: they change through PRs like everything else.
