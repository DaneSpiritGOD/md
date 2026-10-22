# md-web-cli documentation

Everything about `@dane.dai/md-web-cli` lives here.

| Document                                           | Read it for                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| [verify.md](./verify.md)                           | The `verify` gate: what it does, how to run it, how to read a failure |
| [manual-wechat-check.md](./manual-wechat-check.md) | The one human step: pasting both outputs into the real WeChat editor  |
| [blind-spots.md](./blind-spots.md)                 | What the gate cannot see, so a green result is never over-read        |
| [fixtures](../fixtures/README.md)                  | The product fixture and the infrastructure probe                      |

## Install

```bash
npm install -g @dane.dai/md-web-cli
```

Requires Node >= 22.22.2. The published package is a single bundled file with
no runtime dependencies.

## Usage

```bash
md-web-cli render <input.md> -o output.html
md-web-cli --help
```

`render` writes WeChat-ready HTML: inline styles, no `<style>` block, no class
attributes. Pending async content (diagrams, formulas, unregistered code
languages) is a hard failure rather than silent residue.

Configuration comes from the Designer export JSON that `md.doocs.org` produces:

```bash
md-web-cli render notes.md -o notes.html --config my-designer-export.json
```

Individual values can be overridden with flags (`--theme`, `--primary-color`,
`--font-size`, `--code-theme`, …); config-file values take precedence over
defaults, and flags over the config file.

## Verify

```bash
pnpm wcli:verify                 # both fixtures, from the repository root
pnpm wcli:verify --fixture full  # one fixture while debugging
pnpm wcli:verify --self-test     # prove the gate can still fail (no browser)
```

Exit code 0 means the browser's WeChat copy output and the CLI's output are
byte-identical. See [verify.md](./verify.md) for failure output, artifact
handling, config projection, and the browser override.

## Development

```bash
pnpm install
pnpm --filter @dane.dai/md-web-cli build
pnpm --filter @dane.dai/md-web-cli test
```

## License

MIT
