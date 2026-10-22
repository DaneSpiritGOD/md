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

### Reading a probe failure

Check where it stopped:

- **Before the comparison** — an error, a timeout, an empty capture, or a
  missing build: the harness is broken. This is the strong signal the probe
  exists to give.
- **At the comparison** — a byte difference: the probe is reporting the same
  product difference `full.md` reports. The CLI strips `class`/`id` attributes
  and the browser's clipboard HTML keeps them, so this difference is present at
  every scale and is not by itself evidence that the harness broke.
