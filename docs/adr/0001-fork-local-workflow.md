# Fork-local development workflow

This fork carries changes that are deliberately never offered to `doocs/md` upstream: a headless rendering CLI, its two release workflows, and its fixtures. We therefore develop fork-local: commits go straight to `main` with no pull request and no review cycle, and upstream arrives by merging `doocs/md` `main` into ours rather than by rebasing.

## Consequences

- Every push to `main` is a release candidate. Anything that must not ship has to be gated before it lands, not after review.
- Upstream's deploy and release workflows guard on `github.repository == 'doocs/md'`. Those guards are left untouched on purpose: flipping them would make the fork run upstream's infrastructure with secrets it does not have, failing every workflow at once. Fork-side verification runs through the unguarded CI workflow instead.
- A merge from upstream can conflict with fork-local files. Resolution happens in the sync workflow's own workspace and only reaches `main` once verification passes there.

## Considered Options

- **Rebase onto upstream, keep fork changes as a patch series.** Rejected: every upstream change replays the whole series, and a conflict mid-series leaves the branch unbuildable rather than leaving a single merge to resolve.
- **Offer changes upstream and track a release branch.** Rejected: review latency upstream would gate every fork release, and the CLI is not a change upstream has asked for.
