# Known blind spots

A green `verify` result means the CLI's output is byte-identical to the
browser's WeChat copy output for the fixtures. That is a strong statement about
two implementations, and a weak one about the product. These are the gaps it
does not cover.

## No diagram SVG pipeline in the CLI

The browser runs a real SVG pipeline for Mermaid, PlantUML, and infographic
diagrams (WeChat-specific SVG sanitising, label promotion, size attributes).
The CLI has none: `@md/core` is bundled without the diagram extensions, so
diagram input fails hard with "cannot be rendered offline" instead of producing
slightly different SVG.

The absence is therefore **latent**: no fixture can reach it, and a green gate
says nothing about diagrams. Tracked in
[milestone issue #18](https://github.com/DaneSpiritGOD/md/issues/18). When a
diagram pipeline lands, add a diagram fixture — the gate will then hold it to the
same byte-exact bar.

## No automated real-device paste

WeChat's editor is a third implementation: it strips class attributes, rewrites
some styles, and re-flows images. Nothing in this repository pastes output into
WeChat. That step is human and remains so —
see [manual-wechat-check.md](./manual-wechat-check.md).

## The gate is red today, by design

The two implementations differ, and the gate reports those differences rather
than hiding them. Known classes, in the order they dominate the output:

- **`class` and `id` attributes.** The browser's clipboard HTML keeps them
  (WeChat strips them at paste time); the CLI emits the post-paste form. This is
  a product difference to be resolved — either the CLI keeps the attributes or
  the comparison gains a machine-checked transform — not a measurement artefact.
- **Body text colour.** The CLI sets an explicit `color: rgb(10,10,10)` on the
  root section; the browser inherits it from the preview panel. Needs a product
  decision, not a whitelist.
- **Table margin reset.** The browser emits `margin-top: 0 !important` on tables.
- **SVG `overflow` attribute.** The browser sets `overflow="visible"`; the CLI
  omits it. No visual consequence, which is why it is deferred rather than
  guessed at.
- **Unitless versus pixel widths.** The CSS inliner gives the CLI `width="45px"`
  where the browser has `width="45"`.
- **Link `href` normalisation.** The browser's URL parsing adds a trailing
  slash; the CLI keeps the authored URL.

See [ADR-0003](../../../docs/adr/0003-single-verify-gate.md) for why none of
these may be papered over with a tolerance or an allow-list.

## Code-block themes outside the vendored ten

The application offers 73 highlight.js themes; the CLI vendors ten. Any other
theme — including valid values in an unmodified Designer export — makes the CLI
abort with an "unknown code block theme" error rather than render slightly
differently. That is deliberate (hard failure over silent drift) but it narrows
which configurations the gate can verify.

## Network at capture time

The browser copy flow fetches the code-block stylesheet from a CDN and inlines
it. Offline, it silently inlines nothing, so the comparison goes red for an
infrastructure reason. If a failure is CSS-only and the machine is offline, check
that first.

## Marketplace themes

A marketplace theme is not installed in the fresh browser and is not known to the
CLI, so both sides would fall back to their defaults and "agree" by coincidence.
`--config` refuses a theme outside `default` / `grace` / `simple` for that
reason.

## No screenshot or pixel comparison

The gate compares HTML, not pixels. A difference that survives WeChat's
sanitizer identically on both sides will pass even if it looks wrong — that is
the product fixture's job to catch, and the human paste check's job to confirm.
