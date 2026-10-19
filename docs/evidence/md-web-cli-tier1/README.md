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

## Reproduce

```bash
pnpm oracle            # regenerate the Oracle (ticket 06)
pnpm build --filter @dane.dai/md-web-cli
node scripts/oracle/semantic-diff.mjs     # defaults to committed artifacts
node scripts/oracle/verify-defaults.mjs
node scripts/oracle/screenshot-comparison.mjs
```

## Conclusion (machine side)

Every default verifies: mac code block on, `github-dark`, 16px / 1.75 / 1x
spacing, `#0F4C81`, `#576b95`, legend `alt`, body color `rgb(10,10,10)`
(decision settled in ticket 07 to match the browser baseline). The only
property-level difference — the container color being inline in the CLI vs
inherited in the browser — is accepted and documented in the diff report.
`PENDING HUMAN CHECK` remains in the report until the manual WeChat paste is
recorded.
