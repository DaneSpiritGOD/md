# Ship the CLI as a single file with zero runtime dependencies

`md-web-cli` is published as one bundled file plus a manifest, with every dependency — the Markdown renderer, syntax highlighter, HTML sanitizer, and CSS inliner, together with their transitive dependencies — compiled into the bundle. Theme CSS and code-block themes are embedded at build time rather than read from disk or fetched at runtime.

## Consequences

- The CLI never touches the network. Both theme sources move to build time: theme CSS by importing the source files as text, and code-block themes by vendoring the presets the highlighter ships, because the upstream path fetches them from a CDN at runtime and a bundled file has no stable relative path to read from.
- A consumer pins an exact version and gets byte-identical rendering. There is no transitive dependency range to drift and no CDN outage to interrupt a publish.
- Upgrading the renderer, the sanitizer, or the inliner means rebuilding and republishing; nothing resolves at install time.
- Bundling hides which upstream modules actually run, so a diagram extension imported but never invoked would silently bloat the bundle. The bundle entry deliberately omits the diagram extensions and fails hard on their input instead.
