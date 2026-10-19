# Fork-local development workflow

This fork carries changes that are deliberately never offered to `doocs/md` upstream: a headless rendering CLI, its two release workflows, and its fixtures. We therefore develop fork-local: our own commits go straight to `main` with no pull request and no review cycle, while upstream arrives through a sync pull request — created by the sync workflow, verified there before it is opened, and merged by a human after reviewing the diff. Upstream is merged into ours rather than rebased.

## Consequences

- Every push to `main` is a release candidate. Anything that must not ship has to be gated before it lands, not after review.
- Upstream's deploy and release workflows guard on `github.repository == 'doocs/md'`. Those guards are left untouched on purpose: flipping them would make the fork run upstream's infrastructure with secrets it does not have, failing every workflow at once. Fork-side verification runs through the unguarded CI workflow instead.
- Upstream changes land through a sync pull request whose verification has already run in the sync workflow's workspace — the pull request itself carries no checks, because a pull request created with the workflow's own token triggers no workflows. The human review is the gate that verification cannot be: the snapshot gate catches breakage, not badness, and upstream visual changes need human judgment before they reach `main`.
- A merge from upstream can conflict with fork-local files. When the sync workflow cannot produce a clean merge, it notifies and opens nothing; conflict resolution happens locally and the next sync run retries.

## Considered Options

- **Rebase onto upstream, keep fork changes as a patch series.** Rejected: every upstream change replays the whole series, and a conflict mid-series leaves the branch unbuildable rather than leaving a single merge to resolve.
- **Offer changes upstream and track a release branch.** Rejected: review latency upstream would gate every fork release, and the CLI is not a change upstream has asked for.
