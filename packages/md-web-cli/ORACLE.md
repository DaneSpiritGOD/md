# Browser Oracle rebuild (ticket 06)

The Oracle is the browser-rendered ground truth for the `md-web-cli` fidelity
work: the WeChat-format HTML the **fork's own web app** produces for the
ticket 02 synthetic fixture, captured through the real copy flow. It is the
baseline source for ticket 07's semantic diff and the recalibration tool after
upstream visual changes.

The browser appears **only here** — never in the recurring CI path.

## What the run produces

| File                                            | Content                                                                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/md-web-cli/oracle/oracle.html`        | The processed clipboard HTML (exactly what the WeChat copy flow would put on the clipboard): juice-inlined styles, no `<style>` block, WeChat post-processing applied.                                 |
| `packages/md-web-cli/oracle/oracle-report.json` | Metadata (timestamp, revision inputs, byte sizes) plus a **structural summary** of the live preview: element counts per type and key inline styles (h2 background/size/alignment, blockquote, strong). |

Both files are written **atomically** (temp file + rename) and only after
build, render, and copy all succeeded. A failure leaves the previous Oracle
untouched and exits non-zero.

## Run it in CI

`.github/workflows/oracle-rebuild.yml` is a `workflow_dispatch` workflow: it
checks out, installs dependencies, installs Playwright Chromium, builds the web
app (`pnpm --filter @md/web build:only`), runs the script, and uploads the two
files as the `browser-oracle` artifact.

## Run it locally

```bash
# one-time (and after Playwright upgrades)
pnpm exec playwright install chromium

# build the web app (type-check included if you use `build`; the script only
# needs the Vite output, so `build:only` is enough)
pnpm --filter @md/web build

# capture the Oracle
node scripts/oracle/rebuild-oracle.mjs
```

Optional: `ORACLE_PORT=4173` (default) picks the local server port. If your
machine cannot write to `~/Library/Caches/ms-playwright`, point the browser
cache elsewhere: `PLAYWRIGHT_BROWSERS_PATH=<dir> pnpm exec playwright install chromium`.

## How the fixture is injected and the output extracted

1. The script serves `apps/web/dist` on a local static server (the build uses
   the `/md/` base path; the server handles it and falls back to `index.html`).
2. Chromium loads the app headless. The script waits for the CodeMirror editor
   and the `#output` preview container.
3. **Injection** — the script clicks into the CodeMirror editor, presses
   select-all (Control/Meta+A), and sends the fixture
   (`packages/md-web-cli/fixtures/full.md`) via keyboard `insertText`. That
   routes through CodeMirror's native input pipeline, replacing the default
   example document; the app's own debounced update listeners then refresh the
   preview and persist the post exactly as with human typing. No synthetic
   DOM-selection or Pinia internals are involved — both proved fragile
   (CodeMirror ignores injected DOM selections; a `paste` event with
   `insertText` replaced nothing and merely appended).
4. **Readiness** — the script polls the preview until the fixture's
   characteristic markers are present (its h1 text, h2, table, and the default
   example's title gone), no pending async placeholders remain
   (`[data-md-diagram-state="loading"]`, `.katex-pending`), and the preview
   HTML signature stays unchanged across six consecutive 250 ms polls. No
   fixed sleeps.
5. **Extraction** — the header's WeChat copy button (「复制」) is clicked, which
   runs the real `processClipboardContent()` pipeline (juice inlining, WeChat
   variable literalization, nested-list hoisting, image sizing, zero-font-size
   bracketing, SVG sanitization). The resulting `text/html` is read back from
   the browser clipboard (permissions granted in the launch context).
6. The structural summary in the report is parsed from that clipboard HTML
   (post-juice inline styles): element counts per type, key styles (h2
   background/size/alignment, blockquote border, strong color), plus two
   invariants (`hasStyleTag: false`, `hasClassAttributes: true` — class
   stripping is the CLI's WeChat wrapper step, not the browser copy flow).

## Cross-referencing the stored baseline

The stored baseline is a real published article's Markdown + browser output +
editor screenshot from the research phase (Tier 1's prototype artifacts). It is
**not committed** to this repository; keep it wherever the research artifacts
live (e.g. a local research folder or issue attachments on `DaneSpiritGOD/md`)
and compare it by hand against the report's element counts and key styles.
Because the Oracle here is regenerated from the synthetic fixture, the useful
cross-reference is structural: counts per element type and the key inline
styles should match the baseline's per-element properties within the drift
that upstream visual changes explain. Ticket 07 turns this into the automated
semantic diff against the CLI output.
