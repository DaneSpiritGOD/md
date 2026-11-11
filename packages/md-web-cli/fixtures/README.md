# Fixtures

Two inputs for the `verify` gate, with different meanings.

## `full.md` — the product signal

Exercises every rendering surface the CLI supports: h1–h6, tables with
alignment, fenced code blocks in several languages, nested lists, nested
blockquotes, images with and without titles, inline code, strong/emphasis/
strikethrough, links, and horizontal rules. A difference here is a product
fidelity difference; this is the fixture the gate exists for.

## `minimal.md` — an infrastructure probe

A heading, a paragraph, and inline code. Nothing else: no tables, diagrams,
formulas, images, or links. It isolates the harness from the product.

**Read its result strictly one way.** A *failure* means the harness is broken —
the browser capture, the CLI render, or the comparison — which is a strong and
useful signal. A *pass* proves nothing about product fidelity, because the
fixture barely exercises the renderer. Never cite a green `minimal` run as
evidence that the CLI matches the site.

Both fixtures run by default so one command produces both signals; `--fixture`
restricts a run to one while debugging. See the gate's documentation for
invocation.

## `designer-config.json` — the real Designer export used by the config case

A Designer config exported verbatim from the browser (the web application's
import/export feature on md.doocs.org), committed as the source of truth for the
gate's config-projection case. It is not a Markdown fixture: it is the export
that `scripts/verify.mjs` derives the `config` case's input from, replacing the
article content with a marker while keeping the real render-affecting settings
(theme, colors, code-block theme, the active custom-CSS tab, and so on).

It runs the `minimal` fixture under your real configuration and asserts the
article carried in the export never leaks into either output. Keeping it
committed means the config case can never drift from the configuration the CLI
is actually meant to reproduce. See [verify.md](../../../docs/md-web-cli/verify.md).

### Reading a probe failure

Check where it stopped:

- **Before the comparison** — an error, a timeout, an empty capture, or a
  missing build: the harness is broken. This is the strong signal the probe
  exists to give.
- **At the comparison** — a byte difference: the probe is reporting the same
  product difference `full.md` reports. The CLI and the browser keep
  `class`/`id` attributes identically, so a byte difference here is a real
  fidelity difference, not a class-stripping artefact.
