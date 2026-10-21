import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  typescript: true,
  formatters: true,
  // `scripts` stays ignored to match upstream. Upstream never lints it, and
  // un-ignoring it here surfaced pre-existing errors in files this fork does
  // not own (see issue #15).
  ignores: [`.github`, `scripts`, `docker`, `packages/md-cli`, `src/assets`, `example`, `apps/web/src/assets/example/`, `packages/md-web-cli/fixtures/`],
}, {
  rules: {
    'semi': [`error`, `never`],
    'no-unused-vars': `off`,
    'no-console': `off`,
    'no-debugger': `off`,
    'e18e/prefer-array-at': `off`,
    'e18e/prefer-static-regex': `off`,
    'ts/no-namespace': `off`,
    'style/max-statements-per-line': `off`,
    // Catalog is for shared toolchain versions only; package-specific deps stay inline.
    'pnpm/json-enforce-catalog': `off`,
  },
})
