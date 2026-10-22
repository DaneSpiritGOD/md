#!/usr/bin/env node
/**
 * The verify gate.
 *
 * One command, one meaning: build the bundle, capture a fresh Oracle from the
 * browser, render the same fixture through the CLI, and compare the two outputs
 * byte for byte. Exit code 0 only when they are identical.
 *
 * It builds its own inputs so it can never pass against a stale bundle, and it
 * captures the Oracle on every run so it can never pass against a stale
 * baseline. The browser appears only here.
 *
 * Usage: node scripts/verify.mjs [--fixture <name|path>] [--config <file>]
 *                               [--out-dir <dir>] [--keep]
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { compareOutputs } from './verify/compare.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, `..`)
const CLI_BUNDLE = resolve(REPO_ROOT, `packages/md-web-cli/dist/cli.js`)

/**
 * Fixture registry. `full` is the product signal; the minimal
 * infrastructure-probe fixture is added by its own change so a broken harness
 * stays distinguishable from a rendering difference.
 */
const FIXTURES = {
  full: resolve(REPO_ROOT, `packages/md-web-cli/fixtures/full.md`),
}

const BUILD_COMMANDS = [
  [`--filter`, `@md/web`, `build:only`],
  [`--filter`, `@dane.dai/md-web-cli`, `build`],
]

class VerifyError extends Error {}

function printUsage() {
  process.stdout.write(`Usage: node scripts/verify.mjs [options]

Builds the CLI bundle, captures a fresh browser Oracle, renders the same fixture
through the CLI, and compares the two outputs byte for byte. Exits non-zero on
any difference. There is no tolerance, allow-list, or known-gaps mechanism.

Options:
  --fixture <name|path>   Fixture to verify (name: ${Object.keys(FIXTURES).join(`, `)})
                          or a path to a Markdown file
  --config <file>         Designer config JSON; projected to render-affecting
                          keys and given identically to both sides. The five
                          style keys a Designer export cannot carry fall back
                          to each side's own site defaults
  --out-dir <dir>         Write artifacts here and keep them (implies --keep)
  --keep                  Keep the artifacts and print their paths
  -h, --help              Show this help
`)
}

function fail(message) {
  throw new VerifyError(message)
}

export function parseArgs(argv) {
  const args = { fixture: `full`, keep: false }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    const next = () => {
      const value = argv[++index]
      if (value === undefined || value.startsWith(`--`))
        fail(`${arg} requires a value`)
      return value
    }
    if (arg === `--fixture`)
      args.fixture = next()
    else if (arg.startsWith(`--fixture=`))
      args.fixture = arg.slice(`--fixture=`.length)
    else if (arg === `--config`)
      args.config = next()
    else if (arg.startsWith(`--config=`))
      args.config = arg.slice(`--config=`.length)
    else if (arg === `--out-dir`)
      args.outDir = next()
    else if (arg.startsWith(`--out-dir=`))
      args.outDir = arg.slice(`--out-dir=`.length)
    else if (arg === `--keep`)
      args.keep = true
    else if (arg === `-h` || arg === `--help`)
      args.help = true
    else
      fail(`unknown option "${arg}" (see --help)`)
  }
  return args
}

function resolveFixture(value) {
  if (value in FIXTURES) {
    const path = FIXTURES[value]
    if (!existsSync(path))
      fail(`fixture not found: ${path}`)
    return { name: value, path }
  }
  const path = resolve(process.cwd(), value)
  if (!existsSync(path))
    fail(`fixture not found: ${path} (known names: ${Object.keys(FIXTURES).join(`, `)})`)
  return { name: value, path }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: options.capture ? `pipe` : `inherit`,
    encoding: `utf8`,
  })
  if (result.error)
    fail(`${command} failed to start: ${result.error.message}`)
  if (result.status !== 0) {
    if (options.capture && result.stderr)
      process.stderr.write(result.stderr)
    fail(options.describe ?? `${command} ${args.join(` `)} exited ${result.status}`)
  }
  return result
}

function buildEverything() {
  process.stdout.write(`[verify] building its own input (never a previously built bundle)\n`)
  for (const args of BUILD_COMMANDS)
    run(`pnpm`, args, { describe: `build failed: pnpm ${args.join(` `)}` })
}

function renderThroughCli(fixturePath, outPath, configPath) {
  const args = [CLI_BUNDLE, `render`, fixturePath, `-o`, outPath]
  if (configPath)
    args.push(`--config`, configPath)
  run(process.execPath, args, {
    capture: true,
    describe: `CLI render failed for ${fixturePath}`,
  })
}

function formatLocations(locations) {
  const shown = locations.slice(0, 10).map(line => String(line))
  const suffix = locations.length > shown.length ? `, +${locations.length - shown.length} more` : ``
  return `${shown.join(`, `)}${suffix}`
}

function printFailure(fixtureName, oracleHtml, cliHtml, comparison) {
  process.stderr.write(
    `[verify] FAIL ${fixtureName}: outputs are not byte-identical `
    + `(oracle ${Buffer.byteLength(oracleHtml, `utf8`)} bytes, CLI ${Buffer.byteLength(cliHtml, `utf8`)} bytes, `
    + `first difference at byte ${comparison.firstDifference})\n`,
  )
  process.stderr.write(`[verify] difference classes (${comparison.hunkCount} hunks total):\n`)
  for (const entry of comparison.classes) {
    process.stderr.write(
      `  ${entry.name.padEnd(24)} ${String(entry.locations.length).padStart(4)} hunks   lines ${formatLocations(entry.locations)}\n`,
    )
  }
  process.stderr.write(`[verify] complete unified diff:\n`)
  process.stderr.write(`${comparison.unifiedDiff}\n`)
  process.stderr.write(
    `[verify] total: ${comparison.hunkCount} hunks across ${comparison.classes.length} class(es)\n`,
  )
}

function printPass(fixtureName, html) {
  process.stdout.write(
    `[verify] PASS ${fixtureName}: outputs are byte-identical (${Buffer.byteLength(html, `utf8`)} bytes)\n`,
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return 0
  }

  const fixture = resolveFixture(args.fixture)

  let configPath
  if (args.config) {
    configPath = resolve(process.cwd(), args.config)
    if (!existsSync(configPath))
      fail(`config not found: ${configPath}`)
  }

  const keepArtifacts = Boolean(args.outDir || args.keep)
  const workDir = args.outDir
    ? resolve(process.cwd(), args.outDir)
    : mkdtempSync(join(tmpdir(), `md-verify-`))
  const artifactDir = args.outDir ? workDir : join(workDir, fixture.name)
  process.stdout.write(`[verify] artifacts: ${workDir}\n`)

  try {
    buildEverything()

    const { captureOracle } = await import(`./verify/oracle.mjs`)
    const oracleHtml = await captureOracle({
      fixturePath: fixture.path,
      outDir: artifactDir,
    })

    const cliOutPath = join(artifactDir, `cli.html`)
    renderThroughCli(fixture.path, cliOutPath, configPath)
    const cliHtml = readFileSync(cliOutPath, `utf8`)

    const comparison = compareOutputs(oracleHtml, cliHtml)
    writeFileSync(join(artifactDir, `diff.txt`), comparison.unifiedDiff, `utf8`)
    writeFileSync(
      join(artifactDir, `report.txt`),
      comparison.equal
        ? `PASS: outputs are byte-identical (${Buffer.byteLength(oracleHtml, `utf8`)} bytes)\n`
        : `FAIL: ${comparison.hunkCount} hunks across ${comparison.classes.length} class(es)\n${
          comparison.classes.map(entry => `${entry.name}: ${entry.locations.length} hunks at lines ${entry.locations.join(`, `)}\n`).join(``)
        }`,
      `utf8`,
    )

    if (comparison.equal)
      printPass(fixture.name, oracleHtml)
    else
      printFailure(fixture.name, oracleHtml, cliHtml, comparison)

    process.stdout.write(`[verify] oracle: ${join(artifactDir, `oracle.html`)}\n`)
    process.stdout.write(`[verify] cli:    ${cliOutPath}\n`)
    process.stdout.write(`[verify] diff:   ${join(artifactDir, `diff.txt`)}\n`)
    process.stdout.write(`[verify] report: ${join(artifactDir, `report.txt`)}\n`)

    if (keepArtifacts)
      process.stdout.write(`[verify] artifacts preserved: ${workDir}\n`)
    else
      process.stdout.write(`[verify] artifacts are temporary; pass --keep to preserve them\n`)

    return comparison.equal ? 0 : 1
  }
  finally {
    if (!keepArtifacts)
      rmSync(workDir, { recursive: true, force: true })
  }
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode
  })
  .catch((error) => {
    if (error instanceof VerifyError) {
      process.stderr.write(`[verify] ${error.message}\n`)
    }
    else {
      process.stderr.write(`[verify] unexpected failure: ${error?.stack ?? error?.message ?? String(error)}\n`)
    }
    process.exitCode = 1
  })
