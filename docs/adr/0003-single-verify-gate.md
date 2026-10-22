# One byte-exact `verify` gate replaces the three previous verification gates

`md-web-cli` verification is a single command, `verify`: it builds the CLI bundle, captures a fresh Oracle from a real browser, renders the same fixture through the CLI, and compares the two outputs byte for byte with zero tolerance. It exits non-zero on any difference. The browser appears only inside this command; the Oracle is a runtime capability that writes to a temp directory and returns a string, never a committed artifact. The three previous gates — a one-off semantic diff, a recurring golden-snapshot comparison, and an on-demand Oracle rebuild — are deleted, along with the vocabulary that described them.

## Consequences

- The gate builds its own input. It never compares against a bundle on disk, so a changed rendering default cannot pass because nobody rebuilt by hand.
- The Oracle is captured on every run from the current source. Nothing that the gate compares against can be stale, because nothing is stored between runs.
- The comparison has no tolerance, no allow-list, no known-gaps list, and no expiry mechanism. A difference is a failure; there is nothing to configure and nothing to exempt.
- Failure output is actionable rather than binary: a summary grouped by difference class with counts and locations, the complete unified diff, a total hunk count, and both rendered outputs plus the diff under a printed temporary path.
- The command accepts the same Designer config the maintainer publishes with, projected down to render-affecting keys and fed identically to both sides. Article content carried in an export can never leak into the comparison.
- The non-browser assertions the old verifier owned survive inside the comparator: no pending placeholders, and WeChat-ready output with inline styles. A reverse-case self-test corrupts a known-good render and asserts the gate rejects each mutant, so the gate's ability to fail is itself tested without a browser.
- Two seams carry the gate's external behaviour: the `verify` process boundary (exit code, summary shape, artifacts written, and the config-projection case) and the site-default parity unit test. The structural helpers migrated from the retired verifier keep the unit coverage they already had. Rendered-output assertions live inside the byte comparison rather than in separate scripts.
- The repository contains no Oracle HTML, no report, and no golden snapshot. Everything regenerable is produced into a temporary directory at run time.

### The gate deliberately landed red

The two implementations genuinely differ today, so the first landing is red. The residual differences measured with `class`/`id` set aside are six classes: an explicit body text colour on the CLI side, a table margin reset present only in the browser, an SVG `overflow` attribute set only by the browser, unitless versus pixel widths from the CSS inliner, link `href` normalisation performed by browser URL parsing, and a provenance comment only the old Oracle carried.

A byte-exact comparison also reports the `class`/`id` difference itself: the browser's clipboard HTML keeps `class` and `id` attributes because WeChat strips them at paste time, while the CLI emits the post-paste form. That is a real product difference, not a measurement artefact, and it is one of the differences to be resolved after the gate produces output — either the CLI keeps the attributes or the comparison gains a machine-checked transform. The provenance comment, by contrast, is gone by construction: the Oracle capability returns the raw clipboard payload with nothing added.

CI runs the gate as a non-blocking signal until those differences are worked through, so the diff is visible on every change without making every commit on `main` a red build. The publish and upstream-sync workflows run the same command and remain blocking: a red gate publishes nothing and holds the sync pull request. That is accepted for the scaffold period on purpose, not a malfunction — a red publish or sync job during this period means the gate is doing its job.

**The acceptance ends when the difference classes are resolved and `verify` is green.** At that point the CI signal becomes blocking, and the transition from non-blocking to blocking is itself an explicit decision, recorded when it is made. It must not be inherited silently in either direction: neither the non-blocking CI step nor the accepted red in publish and sync is a permanent design.

## Why tolerance is forbidden

A tolerance is a decision that two different renderings are the same, made without looking at which difference it is swallowing. The previous comparator used a numeric tolerance of 0.5 on style values, so a line-height change from 1.75 to 1.8 compared as equal — a real visual regression passed the gate. That is not a near-miss; it is the failure mode the gate exists to prevent.

Tolerance also destroys the gate's diagnostic value. Once a threshold is introduced, every future difference has to be argued against it, and the cheapest resolution is always to widen it slightly. An allow-list is worse: it turns a difference into a permanent exemption that nobody reads again. Both mechanisms make the gate's meaning depend on configuration rather than on the two implementations agreeing.

If normalisation is ever needed — for example to strip an attribute that provably has no visual effect — it must be machine-checked code with tests proving it transforms rather than masks, and the decision must be recorded. That work is explicitly deferred out of this change; there is no normalisation, and no place in the comparator to put one today.

## Why the Oracle became a capability

A committed baseline drifts. The previous design stored accepted HTML in the repository and compared against it, so the artifact could be stale relative to the source, and regenerating it was a separate manual step that nothing on the gate path performed. Evidence kept in the repository also blurred two different things: the accepted baseline, and the instructions for the human acceptance step that cannot be automated. A stale Oracle looked like a current one.

A capability cannot drift. It serves the built application, drives the real copy flow, waits on the application's own readiness signals, and returns the captured HTML. It writes only into a caller-supplied temporary directory, so there is no artifact to commit, refresh, or forget. Its contract is narrow and total: it builds nothing, so the caller must have built first; it fails loudly when the build is missing rather than emitting partial or empty output; and its browser executable is overridable by environment variable so a machine with a browser already installed does not download a second one.

The cost is that a full run needs a browser. That cost is paid by the one command that needs it, not by the test suite: the reverse-case self-test and the defaults parity test are browser-free and run in seconds.

## Considered Options

- **Keep the golden snapshot and regenerate it inside the gate.** Rejected: the artifact stays committed, so it is still regenerable source in the repository, still stale between runs, and still a thing a human can accept by hand. Capturing at run time is strictly simpler and cannot drift.
- **Compare after normalising both sides (strip classes, normalise URLs, coerce widths).** Rejected for now: each rule is a hand-written claim that a difference does not matter, which is the same judgement a tolerance makes, only spelled out. If normalisation is introduced later it must be machine-checked and tested as a transform, not adopted as an escape hatch.
- **Keep the tolerance but shrink the number.** Rejected: any non-zero threshold is a class of differences declared acceptable without examining them, and the number invites widening.
- **Run the Oracle rebuild as a separate workflow and compare against its committed output.** Rejected: this is the previous design that failed. It separates capture from comparison, so the artifact can be older than the source, and it makes the browser a recurring CI cost with committed output as its product.
- **Make CI blocking on landing.** Rejected: the differences are real and unresolved, so every commit on `main` would be red before anyone can act on it. Non-blocking keeps the signal visible while the work proceeds, and the transition to blocking is recorded as a decision rather than inherited.
- **Allow a known-gaps list so the gate can be green while differences remain.** Rejected: a known-gaps list is an allow-list with a story. It converts unresolved differences into permanent exemptions and hides progress instead of counting it.
