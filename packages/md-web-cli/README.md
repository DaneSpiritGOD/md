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

## Development

```bash
pnpm install
pnpm --filter @dane.dai/md-web-cli build
pnpm --filter @dane.dai/md-web-cli test
```

## Verification gate

```bash
node scripts/oracle/verify-snapshot.mjs \
  --fixture packages/md-web-cli/fixtures/full.md \
  --snapshot packages/md-web-cli/golden/snapshot.html
```

Exit code 0 means the rendered output matches the golden snapshot.

## License

MIT
