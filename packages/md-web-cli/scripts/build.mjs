import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.dirname(fileURLToPath(import.meta.url))

await build({
  entryPoints: [path.join(root, '../src/cli.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: path.join(root, '../dist/cli.js'),
  // Single-file, zero-dependency bundle: inline everything, including CSS as
  // text. `.css?raw` keeps the suffix the source uses for Vite/vitest parity.
  loader: { '.css': 'text' },
  external: [],
  packages: 'bundle',
  minify: false,
  sourcemap: false,
  banner: {
    // Shebang for the bin entry, plus CJS shims: bundled CJS deps (jsdom via
    // isomorphic-dompurify) use require()/__dirname at runtime.
    js: [
      '#!/usr/bin/env node',
      `import { createRequire as __createRequire } from 'node:module'`,
      `import { fileURLToPath as __fileURLToPath } from 'node:url'`,
      `import * as __path from 'node:path'`,
      `const require = __createRequire(${JSON.stringify(path.join(root, '../core/package.json'))})`,
      `const __filename = __fileURLToPath(import.meta.url)`,
      `const __dirname = __path.dirname(__filename)`,
    ].join('\n'),
  },
  plugins: [
    {
      name: 'jsdom-default-stylesheet',
      setup(build) {
        build.onLoad(
          { filter: /jsdom[\\/]lib[\\/]jsdom[\\/]living[\\/]css[\\/]helpers[\\/]computed-style\.js$/ },
          async (args) => {
            const jsdomRoot = args.path.slice(0, args.path.lastIndexOf(`lib${path.sep}jsdom`))
            let source = await fs.promises.readFile(args.path, 'utf-8')
            source = source.replace(
              `path.resolve(__dirname, "../../../browser/default-stylesheet.css")`,
              JSON.stringify(path.join(jsdomRoot, 'lib', 'jsdom', 'browser', 'default-stylesheet.css')),
            )
            return { contents: source, loader: 'js' }
          },
        )
      },
    },
    {
      // jsdom lazily require.resolve()s its xhr sync worker relative to its own
      // install; outside the bundle that path doesn't exist. Rewrite the
      // resolution to an absolute path (the worker is never spawned for our
      // rendering flow, so only resolution must succeed).
      name: 'jsdom-xhr-sync-worker',
      setup(build) {
        build.onLoad(
          { filter: /jsdom[\\/]lib[\\/]jsdom[\\/]living[\\/]xhr[\\/]XMLHttpRequest-impl\.js$/ },
          async (args) => {
            const dir = path.dirname(args.path)
            let source = await fs.promises.readFile(args.path, 'utf-8')
            source = source.replace(
              `require.resolve("./xhr-sync-worker.js")`,
              JSON.stringify(path.join(dir, 'xhr-sync-worker.js')),
            )
            return { contents: source, loader: 'js' }
          },
        )
      },
    },
  ],
  logLevel: 'info',
})

process.stdout.write('md-web-cli bundle built\n')
