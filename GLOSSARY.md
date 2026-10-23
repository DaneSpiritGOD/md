# doocs/md

A WeChat Markdown editor that renders Markdown into article HTML for the WeChat official account editor. This glossary covers the vocabulary of the fork's headless rendering work.

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
The browser-rendered baseline produced at verification time: the clipboard HTML a real browser emits for a fixture through the application's own WeChat copy flow. Produced by a capability that writes only to a temporary directory and returns the HTML; never a committed artifact, never reused between runs.
_Avoid_: reference output, baseline HTML, golden file

**verify**:
The single gate: build the bundle, capture a fresh Oracle, render the same fixture through the CLI, and compare the two outputs byte for byte with zero tolerance. Exits non-zero on any difference.
_Avoid_: snapshot gate, fidelity check

**Pending placeholder**:
A marker the renderer leaves where asynchronous hydration has not completed — diagram loading text, a formula placeholder, an unregistered-language marker. The CLI treats any occurrence as a hard failure.
_Avoid_: loading state, stub, TODO marker

**Fork-local package**:
A package that exists only in this fork, such as `@dane.dai/md-web-cli` and its release workflows and fixtures. It is ordinary repository content: changes land through pull requests like everything else.
_Avoid_: fork patch, downstream package
