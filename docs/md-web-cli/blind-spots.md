# Known blind spots

A green `verify` result means the CLI's output is byte-identical to the
browser's WeChat copy output for the fixtures. That is a strong statement about
two implementations, and a weak one about the product. These are the gaps it
does not cover.

## No diagram SVG pipeline in the CLI

The browser runs a real SVG pipeline for Mermaid, PlantUML, and infographic
diagrams (WeChat-specific SVG sanitising, label promotion, marker expansion, and
size attributes). The CLI ports the **generic** SVG path — `overflow="visible"`,
unitless `width`/`height`, and stripped `id`/`class`/`defs` — which is what the
fixtures' mac code-block title-bar SVGs need.

Diagram-specific sanitisation (foreignObject label flattening, marker expansion,
paint baking, viewBox tightening) is **not** ported: `@md/core` is bundled
without the diagram extensions, so diagram input fails hard with "cannot be
rendered offline" instead of producing slightly different SVG.

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

## The gate is green for the default fixtures

The CLI and the browser's WeChat copy flow are byte-identical for `full.md` and
`minimal.md`. The difference classes that used to dominate — `class`/`id`
attributes, explicit body text colour, table `margin-top`, SVG `overflow` and
unitless widths, and link `href` normalisation — are all resolved by aligning
the CLI to the browser's clipboard semantics:

- **`class` and `id` attributes.** The CLI now keeps them, exactly like the
  browser (WeChat strips them at paste time), so the two outputs match.
- **Body text colour.** The CLI no longer sets an explicit `color` on the root
  section; like the browser it inherits from the article body.
- **Table margin reset.** The `#output section > :first-child` rule is
  unscoped before inlining, so the browser's `margin-top: 0 !important` appears.
- **SVG handling.** The CLI now sets `overflow="visible"` and unitless
  `width`/`height` on every SVG, matching the browser's generic sanitise path.

A green `full` run is a strong statement about the two implementations agreeing
on the fixture surfaces. It remains a weak one about diagrams and about the real
WeChat editor — see the sections below. Do not paper over a future difference
with a tolerance; work it off the same way.

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
