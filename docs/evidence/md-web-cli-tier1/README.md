# md-web-cli Tier 1 acceptance evidence (ticket 07)

Machine-side proof that the browserless CLI (`@dane.dai/md-web-cli`) produces
output equivalent to the site's WeChat copy flow for the shared fixture.

| File                                           | What it is                                                                                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `oracle.html`                                  | Copy of the ticket 06 browser Oracle (gitignored in `packages/md-web-cli/oracle/`, stored here as committed evidence). Produced at fork revision `ca3f7219` via `pnpm oracle`. |
| `cli-output.html`                              | CLI render of `packages/md-web-cli/fixtures/full.md` with site defaults.                                                                                                       |
| `semantic-diff-report.md` / `.json`            | Semantic diff: 100 property matches, 0 failures, 1 accepted inheritance delta, all raw-HTML deltas classified (script: `scripts/oracle/semantic-diff.mjs`).                    |
| `defaults-verification.txt`                    | Output of `scripts/oracle/verify-defaults.mjs`: site `defaultStyleConfig` cross-check + rendered-output assertions, all PASS.                                                  |
| `screenshot-oracle.png` / `screenshot-cli.png` | Full-page headless-Chromium screenshots of both outputs.                                                                                                                       |
| `screenshot-side-by-side.png`                  | Both outputs side by side in one viewport.                                                                                                                                     |
| `manual-wechat-check.md`                       | Instructions for the one human step: pasting both outputs into the WeChat editor and recording the conclusion.                                                                 |

## Tier 2 golden snapshot (ticket 08)

The CLI render of `packages/md-web-cli/fixtures/full.md` confirmed here is
committed as the **golden snapshot** at
`packages/md-web-cli/golden/snapshot.html` — i.e. the snapshot IS the
Tier-1-confirmed artifact (100/100 semantic property matches, see
`semantic-diff-report.md` above). It is the semantic baseline for
the Tier 2 gate used by the publish (ticket 09) and sync (ticket 10)
workflows: `scripts/oracle/verify-snapshot.mjs` re-renders the fixture and
asserts exit code 0, zero pending placeholders, WeChat-ready inline styles,
and key properties matching the snapshot (same extraction/tolerance rules as
`semantic-diff.mjs`, shared via `scripts/oracle/lib/extract.mjs`).

- Regenerate after an intentional visual change: `pnpm oracle:refresh-snapshot`
- Verify: `pnpm oracle:verify-snapshot` (or
  `node scripts/oracle/verify-snapshot.mjs --fixture <md> --snapshot <html>`)
- Self-test (reverse cases must fail): `node scripts/oracle/verify-snapshot.mjs --self-test`
- The ticket 06 `oracle-report.json` records `goldenSnapshotPath` pointing at
  the snapshot.

## Reproduce

```bash
pnpm oracle            # regenerate the Oracle (ticket 06)
pnpm build --filter @dane.dai/md-web-cli
node scripts/oracle/semantic-diff.mjs     # defaults to committed artifacts
node scripts/oracle/verify-defaults.mjs
node scripts/oracle/screenshot-comparison.mjs
pnpm oracle:verify-snapshot            # Tier 2 golden-snapshot gate (ticket 08)
```

## Conclusion (machine side)

Every default verifies: mac code block on, `github-dark`, 16px / 1.75 / 1x
spacing, `#0F4C81`, `#576b95`, legend `alt`, body color `rgb(10,10,10)`
(decision settled in ticket 07 to match the browser baseline). The only
property-level difference — the container color being inline in the CLI vs
inherited in the browser — is accepted and documented in the diff report.
`PENDING HUMAN CHECK` remains in the report until the manual WeChat paste is
recorded.
