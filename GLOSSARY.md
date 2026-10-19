# doocs/md

A WeChat Markdown editor that renders Markdown into article HTML for the WeChat official account editor. This glossary covers the vocabulary of the fork-local headless rendering work.

## Language

**md-web-cli**:
A headless Markdown-to-WeChat-ready-HTML converter shipped as a Node CLI from this fork.
_Avoid_: renderer CLI, headless backend, md-to-richtext

**WeChat-ready HTML**:
HTML that pastes into the WeChat article editor without further processing: inline styles, no class attributes, no `<style>` blocks.
_Avoid_: richtext, inlined HTML, clipboard HTML

**Designer config**:
The JSON produced by the `md.doocs.org` designer's import/export feature; the CLI's primary configuration input.
_Avoid_: site config, theme JSON, export JSON

**MCP schema JSON**:
The render-parameter dialect of `@md/mcp-server`, accepted by the CLI as an alias dialect for Designer config.
_Avoid_: MCP config, agent config

**Renderer options**:
The normalized internal parameter set the renderer consumes, named after the renderer (for example `citeStatus`), after any dialect has been normalized into it.
_Avoid_: render flags, CLI options

**Oracle**:
Baseline HTML produced by rendering a fixture in a real browser.
_Avoid_: reference output, baseline HTML

**Tier 1**:
A one-off semantic diff between an Oracle and CLI output, run once at implementation acceptance.
_Avoid_: golden test, visual regression

**Tier 2**:
The recurring gate that asserts CLI output against a Golden snapshot on every candidate release.
_Avoid_: snapshot test, CI check

**Tier 3**:
An on-demand rebuild that regenerates an Oracle for the current fork revision.
_Avoid_: oracle refresh, recalibration

**Golden snapshot**:
The CLI output committed to the repo as the reference Tier 2 asserts against, once Tier 1 has confirmed it.
_Avoid_: baseline, fixture output

**Pending placeholder**:
A marker the renderer leaves where asynchronous hydration has not completed — diagram loading text, a formula placeholder, an unregistered-language marker. The CLI treats any occurrence as a hard failure.
_Avoid_: loading state, stub, TODO marker

**Fork-local change**:
A change that exists only in this fork and is never offered upstream.
_Avoid_: local patch, downstream change
