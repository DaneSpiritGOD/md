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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { compareOutputs } from './verify/compare.mjs'
import { assertConfigApplied, buildConfigSeedScript, ConfigError, projectDesignerConfig } from './verify/config.mjs'
import { isCiEnvironment } from './verify/environment.mjs'
import { assertOutsideRepository, REPO_ROOT } from './verify/paths.mjs'
import { runSelfTest } from './verify/self-test.mjs'
import { findStructuralProblems } from './verify/structural.mjs'

const CLI_BUNDLE = resolve(REPO_ROOT, `packages/md-web-cli/dist/cli.js`)
const FIXTURE_DIR = resolve(REPO_ROOT, `packages/md-web-cli/fixtures`)

/**
 * Fixture registry.
 *
 * `full` is the product signal. `minimal` is an infrastructure probe: its
 * failure means the harness is broken, its success proves nothing about
 * product fidelity. Both run by default so one command yields both signals.
 */
const FIXTURES = {
  full: {
    path: join(FIXTURE_DIR, `full.md`),
    role: `product signal`,
    summary: `headings, tables, code blocks, lists, blockquotes, images, links, rules`,
    failureMeaning: `a difference here is a product fidelity difference`,
  },
  minimal: {
    path: join(FIXTURE_DIR, `minimal.md`),
    role: `infrastructure probe`,
    summary: `heading, paragraph, inline code — a failure means the harness is broken and a pass proves nothing about product fidelity`,
    failureMeaning: `a probe failure means the harness is broken, not that rendering drifted`,
  },
}

const ARTICLE_MARKER = `ARTICLE MARKER: this article must never be rendered`

/**
 * The config-projection case.
 *
 * Runs the `minimal` fixture with the **committed real Designer export** (a
 * config a user actually exported from the browser's import/export feature, not
 * a hand-built fixture). It proves the gate never compares an article carried in
 * the export, only the fixture: the config is projected down to render-affecting
 * keys, the same projected file feeds both sides, and the article marker must
 * never appear in either output. This is the guarantee the former browser-gated
 * `verify-config.test.ts` provided, now part of the gate itself so every default
 * run covers it.
 *
 * The export is derived from `fixtures/designer-config.json` at gate load time:
 * the real render settings and pure-UI state are kept as-is (theme, colors, the
 * active custom-CSS tab, and so on), while the article content is swapped for a
 * fake marker. Using the committed export as the single source of truth means
 * the case can never drift from the real configuration it is meant to exercise.
 *
 * It is a case, not a fixture: `--fixture` still names only `full`/`minimal`
 * (and paths), so the case runs once in the default gate and cannot be
 * misread as a fixture a user would render.
 */
const DESIGNER_CONFIG_FIXTURE = join(FIXTURE_DIR, `designer-config.json`)

function buildConfigCaseExport() {
  const raw = JSON.parse(readFileSync(DESIGNER_CONFIG_FIXTURE, `utf8`))
  return {
    // The real render-affecting settings first, kept verbatim from the export
    // (theme, colors, the active custom-CSS tab, and so on).
    ...raw,
    // Article content: must be dropped before either side sees the config.
    posts: [{ id: `post-1`, content: `# ${ARTICLE_MARKER}` }],
    currentPostId: `post-1`,
    currentPostIndex: 0,
    titleList: [ARTICLE_MARKER],
    readingTime: { words: 9999, minutes: 42 },
    // Pure-UI state stays verbatim from the export: projection drops it before
    // either side sees the config, so it has no effect on the rendered article.
  }
}

const CONFIG_CASE = {
  name: `config`,
  role: `config projection gate`,
  summary: `config projection: runs minimal with the committed real Designer export, asserting article content never leaks`,
  failureMeaning: `config projection leaked article content or UI state into the comparison`,
  fixture: FIXTURES.minimal,
  export: buildConfigCaseExport(),
}

const BUILD_COMMANDS = [
  [`--filter`, `@md/web`, `build:only`],
  [`--filter`, `@dane.dai/md-web-cli`, `build`],
]

class VerifyError extends Error {}

function printUsage() {
  process.stdout.write(`Usage: node scripts/verify.mjs [options]

Builds the CLI bundle, captures a fresh browser Oracle for each fixture, renders
the same fixture through the CLI, and compares the outputs byte for byte. Exits
non-zero on any difference. There is no tolerance, allow-list, or known-gaps
mechanism.

Fixtures (both run by default):
${
  Object.entries(FIXTURES).map(([name, fixture]) => `  ${name.padEnd(9)} ${fixture.role} — ${fixture.summary}`).join(`\n`)
}

Cases (run by default):
  ${CONFIG_CASE.name.padEnd(9)} ${CONFIG_CASE.role} — ${CONFIG_CASE.summary}

Options:
  --fixture <name|path>   Run one fixture (or a path to a Markdown file) instead
                          of both registry fixtures
  --config <file>         Designer config JSON; projected to render-affecting
                          keys and given identically to both sides. The five
                          style keys a Designer export cannot carry fall back
                          to each side's own site defaults
  --out-dir <dir>         Write artifacts here and keep them (implies --keep;
                          must be outside the repository)
  --keep                  Keep the artifacts and print their paths
  --self-test             Reverse-case self-test: corrupt a known-good CLI
                          render several ways and assert the gate rejects each
                          mutant. Needs no browser
  -h, --help              Show this help
`)
}

function fail(message) {
  throw new VerifyError(message)
}

function parseArgs(argv) {
  const args = { keep: false, fixture: null }
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
    else if (arg === `--self-test`)
      args.selfTest = true
    else if (arg === `-h` || arg === `--help`)
      args.help = true
    else
      fail(`unknown option "${arg}" (see --help)`)
  }
  return args
}

function resolveFixtures(value) {
  if (value === null)
    return Object.entries(FIXTURES).map(([name, fixture]) => ({ name, ...fixture }))
  if (value in FIXTURES)
    return [{ name: value, ...FIXTURES[value] }]
  const path = resolve(process.cwd(), value)
  if (!existsSync(path))
    fail(`fixture not found: ${path} (known names: ${Object.keys(FIXTURES).join(`, `)})`)
  return [{ name: value, path, role: `custom fixture`, failureMeaning: `outputs differ` }]
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

function printStructuralFailure(fixture, problems) {
  process.stderr.write(
    `[verify] STRUCTURAL FAIL ${fixture.name}: ${problems.length} WeChat-readiness problem(s) in the CLI output\n`,
  )
  for (const problem of problems)
    process.stderr.write(`  ${problem.kind}: ${problem.detail}\n`)
}

function printFailure(fixture, oracleHtml, cliHtml, comparison) {
  process.stderr.write(
    `[verify] FAIL ${fixture.name} (${fixture.role}): outputs are not byte-identical `
    + `(oracle ${Buffer.byteLength(oracleHtml, `utf8`)} bytes, CLI ${Buffer.byteLength(cliHtml, `utf8`)} bytes, `
    + `first difference at byte ${comparison.firstDifference})\n`,
  )
  process.stderr.write(`[verify] ${fixture.failureMeaning}\n`)
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

function printPass(fixture, html) {
  process.stdout.write(
    `[verify] PASS ${fixture.name} (${fixture.role}): outputs are byte-identical (${Buffer.byteLength(html, `utf8`)} bytes)\n`,
  )
  if (fixture.role === `infrastructure probe`)
    process.stdout.write(`[verify] note: a green infrastructure probe proves nothing about product fidelity\n`)
}

function isPassing(result) {
  return result.comparison.equal
    && result.structuralProblems.length === 0
    && !result.configLeak
}

function printSummary(results) {
  const passed = results.filter(isPassing).length
  process.stdout.write(
    `[verify] summary: ${results.length} check(s) — ${passed} passed, ${results.length - passed} failed\n`,
  )
  for (const result of results) {
    const { fixture, comparison, structuralProblems, configLeak } = result
    const verdict = isPassing(result) ? `PASS` : `FAIL`
    const details = []
    if (!comparison.equal)
      details.push(`${comparison.hunkCount} hunks: ${fixture.failureMeaning}`)
    if (structuralProblems.length > 0)
      details.push(`${structuralProblems.length} structural problem(s)`)
    if (configLeak)
      details.push(`config projection leaked article content into the comparison`)
    const detail = details.length > 0 ? ` — ${details.join(`; `)}` : ``
    process.stdout.write(`  ${verdict} ${fixture.name} (${fixture.role})${detail}\n`)
  }
}

async function verifyFixture({ fixture, workDir, configPath, projectedConfig, captureOracle }) {
  const artifactDir = join(workDir, fixture.name)
  mkdirSync(artifactDir, { recursive: true })
  process.stdout.write(`[verify] fixture: ${fixture.name} — ${fixture.role}\n`)

  // Render through the CLI first: a config or fixture the CLI rejects fails in
  // under a second instead of after the browser capture.
  const cliOutPath = join(artifactDir, `cli.html`)
  renderThroughCli(fixture.path, cliOutPath, configPath)
  const cliHtml = readFileSync(cliOutPath, `utf8`)

  const oracleHtml = await captureOracle({
    fixturePath: fixture.path,
    outDir: artifactDir,
    ...(projectedConfig
      ? {
          initScripts: [buildConfigSeedScript(projectedConfig)],
          afterLoad: page => assertConfigApplied(page, projectedConfig),
        }
      : {}),
  })

  const structuralProblems = findStructuralProblems(cliHtml)
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

  if (structuralProblems.length > 0)
    printStructuralFailure(fixture, structuralProblems)

  if (comparison.equal)
    printPass(fixture, oracleHtml)
  else
    printFailure(fixture, oracleHtml, cliHtml, comparison)

  process.stdout.write(`[verify] oracle: ${join(artifactDir, `oracle.html`)}\n`)
  process.stdout.write(`[verify] cli:    ${cliOutPath}\n`)
  process.stdout.write(`[verify] diff:   ${join(artifactDir, `diff.txt`)}\n`)
  process.stdout.write(`[verify] report: ${join(artifactDir, `report.txt`)}\n`)

  return { fixture, comparison, structuralProblems }
}

/**
 * Whether the config-projection case should run in this invocation.
 *
 * It runs in the default gate. A `--fixture` narrows to one fixture for
 * debugging, and an explicit `--config` already exercises projection for that
 * fixture, so either opts it out.
 */
function configCaseShouldRun(args, requestedConfig) {
  return args.fixture === null && requestedConfig === undefined
}

/**
 * Run the config-projection case.
 *
 * Projects the built-in export, writes the projected config, renders the
 * `minimal` fixture through the whole gate with it, then asserts the article
 * carried in the export never reaches either side. A leak fails the case even
 * when the two sides are byte-identical, because a leaked article would compare
 * identical while still shipping the marker.
 */
async function verifyConfigCase({ workDir, captureOracle }) {
  const { projected, dropped } = projectDesignerConfig(CONFIG_CASE.export)
  const keptCount = Object.keys(projected).length
  const droppedCount = dropped.content.length + dropped.ui.length + dropped.unknown.length
  process.stdout.write(
    `[verify] config: ${keptCount} render-affecting key(s) kept, ${droppedCount} dropped `
    + `(${dropped.content.length} article-content, ${dropped.ui.length} UI, ${dropped.unknown.length} unknown)\n`,
  )
  if (dropped.unknown.length > 0)
    process.stdout.write(`[verify] config: unknown keys ignored: ${dropped.unknown.join(`, `)}\n`)
  const configPath = join(workDir, `config-case-projected-config.json`)
  writeFileSync(configPath, JSON.stringify(projected, null, 2), `utf8`)
  process.stdout.write(`[verify] config: the same projected file goes to both sides (${configPath})\n`)

  const result = await verifyFixture({
    fixture: {
      name: CONFIG_CASE.name,
      ...CONFIG_CASE.fixture,
      role: CONFIG_CASE.role,
      summary: CONFIG_CASE.summary,
      failureMeaning: CONFIG_CASE.failureMeaning,
    },
    workDir,
    configPath,
    projectedConfig: projected,
    captureOracle,
  })

  const artifactDir = join(workDir, CONFIG_CASE.name)
  const cliHtml = readFileSync(join(artifactDir, `cli.html`), `utf8`)
  const oracleHtml = readFileSync(join(artifactDir, `oracle.html`), `utf8`)
  const leakedSides = []
  for (const [side, html] of [[`cli`, cliHtml], [`oracle`, oracleHtml]]) {
    if (html.includes(ARTICLE_MARKER))
      leakedSides.push(side)
  }

  if (leakedSides.length > 0) {
    process.stderr.write(
      `[verify] CONFIG LEAK ${CONFIG_CASE.name}: the article marker reached the ${leakedSides.join(` and `)} output\n`,
    )
    result.configLeak = true
  }
  else {
    result.configLeak = false
  }

  return result
}

async function runSelfTestMode() {
  const workDir = mkdtempSync(join(tmpdir(), `md-verify-self-test-`))
  try {
    process.stdout.write(`[self-test] building the CLI bundle (no browser involved)\n`)
    run(`pnpm`, [`--filter`, `@dane.dai/md-web-cli`, `build`], { describe: `build failed` })
    const knownGoodPath = join(workDir, `known-good.html`)
    run(process.execPath, [CLI_BUNDLE, `render`, FIXTURES.full.path, `-o`, knownGoodPath], {
      capture: true,
      describe: `CLI render failed; the self-test needs a known-good render`,
    })

    const { baselineProblems, positiveControl, cases } = runSelfTest(readFileSync(knownGoodPath, `utf8`))
    if (!positiveControl) {
      process.stderr.write(
        `[self-test] FAIL: identical input did not compare equal; every reverse case would pass for the wrong reason\n`,
      )
      return 1
    }
    process.stdout.write(`[self-test] PASS: identical input compares equal\n`)

    if (baselineProblems.length > 0) {
      process.stderr.write(`[self-test] baseline render is not WeChat-ready; cannot self-test against it:\n`)
      for (const problem of baselineProblems)
        process.stderr.write(`  ${problem.kind}: ${problem.detail}\n`)
      return 1
    }

    let ok = true
    for (const testCase of cases) {
      if (testCase.rejected) {
        process.stdout.write(`[self-test] PASS: ${testCase.name} -> gate rejects it (${testCase.firstReason})\n`)
        continue
      }
      ok = false
      const missingKind = testCase.expectedKind && !testCase.expectedKindFound
        ? ` (expected a "${testCase.expectedKind}" problem, saw: ${testCase.matchedKinds.join(`, `) || `none`})`
        : ``
      process.stderr.write(
        `[self-test] FAIL: ${testCase.name} was NOT rejected${missingKind}; the gate cannot be trusted\n`,
      )
    }
    process.stdout.write(
      `[self-test] ${ok ? `PASS` : `FAIL`}: ${cases.length} reverse case(s), every mutant must be rejected\n`,
    )
    return ok ? 0 : 1
  }
  finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return 0
  }
  if (args.selfTest)
    return runSelfTestMode()

  process.stdout.write(
    `[verify] environment: ${isCiEnvironment() ? `CI` : `local (system Chrome is a fallback only)`}\n`,
  )

  const fixtures = resolveFixtures(args.fixture)
  for (const fixture of fixtures) {
    if (!existsSync(fixture.path))
      fail(`fixture not found: ${fixture.path}`)
  }

  let requestedConfig
  if (args.config) {
    const sourcePath = resolve(process.cwd(), args.config)
    if (!existsSync(sourcePath))
      fail(`config not found: ${sourcePath}`)
    try {
      requestedConfig = JSON.parse(readFileSync(sourcePath, `utf8`))
    }
    catch (error) {
      fail(`config is not valid JSON: ${error.message}`)
    }
  }

  const keepArtifacts = Boolean(args.outDir || args.keep)
  let workDir
  if (args.outDir) {
    try {
      workDir = assertOutsideRepository(resolve(process.cwd(), args.outDir), `--out-dir`)
    }
    catch (error) {
      fail(error.message)
    }
  }
  else {
    workDir = mkdtempSync(join(tmpdir(), `md-verify-`))
  }
  mkdirSync(workDir, { recursive: true })
  process.stdout.write(`[verify] artifacts: ${workDir}\n`)

  try {
    let configPath
    let projectedConfig
    if (requestedConfig) {
      const { projected, dropped } = projectDesignerConfig(requestedConfig)
      projectedConfig = projected
      const keptCount = Object.keys(projected).length
      const droppedCount = dropped.content.length + dropped.ui.length + dropped.unknown.length
      process.stdout.write(
        `[verify] config: ${keptCount} render-affecting key(s) kept, ${droppedCount} dropped `
        + `(${dropped.content.length} article-content, ${dropped.ui.length} UI, ${dropped.unknown.length} unknown)\n`,
      )
      if (dropped.unknown.length > 0)
        process.stdout.write(`[verify] config: unknown keys ignored: ${dropped.unknown.join(`, `)}\n`)
      configPath = join(workDir, `projected-config.json`)
      writeFileSync(configPath, JSON.stringify(projected, null, 2), `utf8`)
      process.stdout.write(`[verify] config: the same projected file goes to both sides (${configPath})\n`)
    }

    buildEverything()
    // Loaded lazily: this module pulls in Playwright, and --help, argument
    // validation, and --self-test must not pay for the browser driver.
    const { captureOracle } = await import(`./verify/oracle.mjs`)

    const results = []
    for (const fixture of fixtures)
      results.push(await verifyFixture({ fixture, workDir, configPath, projectedConfig, captureOracle }))

    // The config case runs in the default gate only. A `--fixture` narrows to a
    // single fixture for debugging, and an explicit `--config` already exercises
    // config projection for that fixture, so running it again would be redundant.
    if (configCaseShouldRun(args, requestedConfig))
      results.push(await verifyConfigCase({ workDir, captureOracle }))

    printSummary(results)

    if (keepArtifacts)
      process.stdout.write(`[verify] artifacts preserved: ${workDir}\n`)
    else
      process.stdout.write(`[verify] artifacts are temporary; pass --keep to preserve them\n`)

    return results.every(isPassing) ? 0 : 1
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
    if (error instanceof VerifyError || error instanceof ConfigError) {
      process.stderr.write(`[verify] ${error.message}\n`)
    }
    else {
      process.stderr.write(`[verify] unexpected failure: ${error?.stack ?? error?.message ?? String(error)}\n`)
    }
    process.exitCode = 1
  })
