# @dane.dai/md-web-cli

Browserless [doocs/md](https://github.com/doocs/md) rendering CLI — a
single-file, zero-dependency Node bundle that renders Markdown to
WeChat-compatible HTML without a browser.

## Install

```bash
npm install -g @dane.dai/md-web-cli
```

Requires Node >= 22.22.2.

## Usage

```bash
md-web-cli render <input.md> -o output.html
md-web-cli --help
```

## Documentation

Full documentation lives in the repository's [`docs/md-web-cli/`](../../docs/md-web-cli/README.md):

- [The `verify` gate](../../docs/md-web-cli/verify.md) — one command, byte-exact comparison
- [Manual WeChat check](../../docs/md-web-cli/manual-wechat-check.md) — the one human step
- [Known blind spots](../../docs/md-web-cli/blind-spots.md) — what a green result does not mean
- [Fixtures](./fixtures/README.md) — the product signal and the infrastructure probe

## License

MIT
