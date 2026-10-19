/**
 * Tier 2 golden-snapshot verifier (ticket 08).
 *
 * The shared verification core for the publish (ticket 09) and sync
 * (ticket 10) workflows. Standalone and stateless: every input comes from
 * explicit CLI args (with repo-relative defaults), renders run in an
 * OS-temp directory, and nothing is written outside them. Exit code 0 means
 * the artifact passed every gate; non-zero with a printed reason list
 * otherwise.
 *
 * Checks, in order:
 *   1. A fresh CLI render of the fixture exits 0.
 *   2. The output carries no pending placeholders (mermaid/plantuml/
 *      infographic `data-md-diagram-state="loading"`, `katex-pending`,
 *      `data-language-pending`) — same marker set as
 *      packages/md-web-cli/src/wechat.ts `detectPendingPlaceholders`,
 *      re-implemented here so the gate has no runtime dependency on the
 *      built bundle.
 *   3. The output is WeChat-ready: zero class attributes, zero <style>
 *      tags, and every block-level element carries a style attribute
 *      (tr/tbody/svg are exempt — WeChat formats them structurally).
 *   4. Key visual properties match the committed golden snapshot
 *      semantically (same extraction + tolerance rules as
 *      scripts/oracle/semantic-diff.mjs, via scripts/oracle/lib/extract.mjs).
 *
 * Self-test (reverse cases — the gate must fail on a bad artifact):
 *   node scripts/oracle/verify-snapshot.mjs --self-test
 * mutates a known-good render three ways (injected pending placeholder,
 * stripped inline styles, truncation) and asserts each mutant FAILS the
 * corresponding assertion. Exits non-zero if any mutant wrongly passes.
 *
 * Contract used by workflows (tickets 09/10):
 *   node scripts/oracle/verify-snapshot.mjs \
 *     --fixture packages/md-web-cli/fixtures/full.md \
 *     --snapshot packages/md-web-cli/golden/snapshot.html
 * Run `pnpm --filter @dane.dai/md-web-cli build` first (or pass --cli to an
 * already-built bundle); the script renders with whatever --cli points at
 * and does not build on its own.
 *
 * Regenerate the golden snapshot after an intentional visual change:
 *   pnpm oracle:refresh-snapshot
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { colorsMatch, extractProperties, valuesMatch } from './lib/extract.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')

// ---------------------------------------------------------------------------
// CLI args — everything explicit, nothing read from the environment
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const args = {
    fixture: resolve(REPO_ROOT, 'packages/md-web-cli/fixtures/full.md'),
    snapshot: resolve(REPO_ROOT, 'packages/md-web-cli/golden/snapshot.html'),
    cli: resolve(REPO_ROOT, 'packages/md-web-cli/dist/cli.js'),
    selfTest: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i]?.replace(/^--/, '')
    const value = argv[i + 1]
    if (key === 'self-test')
      args.selfTest = true
    else if (key in args && value)
      args[key] = resolve(process.cwd(), value)
  }
  return args
}

// ---------------------------------------------------------------------------
// Assertion 2: pending placeholders
// ---------------------------------------------------------------------------

const PENDING_KINDS = {
  diagram: 'async diagram placeholder (data-md-diagram-state="loading")',
  katex: 'KaTeX formula placeholder (katex-pending)',
  language: 'unregistered code language (data-language-pending)',
}

/**
 * Scan for pending-async markers. Mirrors detectPendingPlaceholders in
 * packages/md-web-cli/src/wechat.ts: leading <style> blocks are stripped
 * first so legitimate CSS selectors such as `.katex-pending` never read as
 * pending content.
 */
export function findPendingPlaceholders(html) {
  const bodyHtml = html.replace(/<style>[\s\S]*?<\/style>/g, '')
  const found = []
  if (/<div[^>]*data-md-diagram-state="loading"/.test(bodyHtml))
    found.push(PENDING_KINDS.diagram)
  if (/<[^>]*\bkatex-pending\b/.test(bodyHtml))
    found.push(PENDING_KINDS.katex)
  for (const match of bodyHtml.matchAll(/data-language-pending="([^"]*)"/g))
    found.push(`${PENDING_KINDS.language}: ${match[1]}`)
  return found
}

// ---------------------------------------------------------------------------
// Assertion 3: WeChat-ready inline styles
// ---------------------------------------------------------------------------

/** Elements WeChat formats structurally; they legitimately carry no style attr. */
const STYLE_EXEMPT = new Set(['tr', 'tbody', 'thead', 'svg'])

export function findInlineStyleProblems(html) {
  const problems = []
  if (/<style[\s>]/i.test(html))
    problems.push('document contains a <style> tag')
  const classAttrs = html.match(/\sclass\s*=\s*(["'])/g) ?? []
  if (classAttrs.length > 0)
    problems.push(`document contains ${classAttrs.length} class attribute(s)`)
  const blockTags = [
    'section',
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'table',
    'pre',
    'ul',
    'ol',
    'li',
    'td',
    'th',
    'figure',
    'figcaption',
    'hr',
    'div',
    'details',
    'summary',
  ]
  for (const [, , attrs] of html.matchAll(new RegExp(`<(${blockTags.join('|')})\\b([^>]*)>`, 'gi'))) {
    if (!/\sstyle\s*=/i.test(attrs) && !STYLE_EXEMPT.has(attrs))
      problems.push(`block-level element without style attribute`)
  }
  return problems
}

// ---------------------------------------------------------------------------
// Assertion 4: semantic match against the snapshot
// ---------------------------------------------------------------------------

/**
 * Compare two extracted property sets. Presence must match on both sides,
 * element counts must match exactly, and each property value must match
 * through colorsMatch/valuesMatch (same tolerance as semantic-diff).
 */
export function semanticDifferences(rendered, snapshot) {
  const diffs = []
  for (const key of ['hasStyleTag', 'hasClassAttributes']) {
    if (rendered[key] !== snapshot[key])
      diffs.push(`structural.${key}: rendered=${rendered[key]} snapshot=${snapshot[key]}`)
  }
  for (const [tag, count] of Object.entries(snapshot.counts)) {
    if (rendered.counts[tag] !== count)
      diffs.push(`counts.${tag}: rendered=${rendered.counts[tag]} snapshot=${count}`)
  }
  for (const [section, snapProps] of Object.entries(snapshot)) {
    if (section === 'counts' || section === 'hasStyleTag' || section === 'hasClassAttributes' || section === 'zeroFontSizeBrackets')
      continue
    const renProps = rendered[section]
    if ((snapProps === null) !== (renProps === null)) {
      diffs.push(`${section}: present rendered=${renProps !== null} snapshot=${snapProps !== null}`)
      continue
    }
    if (!snapProps)
      continue
    for (const prop of Object.keys(snapProps)) {
      const a = renProps[prop]
      const b = snapProps[prop]
      if (a === null && b === null)
        continue
      if (a === null || b === null || (!colorsMatch(a, b) && !valuesMatch(a, b)))
        diffs.push(`${section}.${prop}: rendered="${a}" snapshot="${b}"`)
    }
  }
  return diffs
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * Run all assertions against one artifact pair. Returns a list of failure
 * reasons — empty means pass. No hidden state: the same inputs always
 * produce the same verdict.
 */
export function evaluateArtifact(renderedHtml, snapshotHtml) {
  const reasons = []
  for (const pending of findPendingPlaceholders(renderedHtml))
    reasons.push(`pending placeholder: ${pending}`)
  for (const problem of findInlineStyleProblems(renderedHtml))
    reasons.push(`inline styles: ${problem}`)
  const rendered = extractProperties(renderedHtml)
  const snapshot = extractProperties(snapshotHtml)
  for (const diff of semanticDifferences(rendered, snapshot))
    reasons.push(`snapshot mismatch: ${diff}`)
  return reasons
}

/** Render the fixture with the CLI bundle. Throws if the exit code is non-zero. */
export function renderFixture(cliPath, fixturePath, outPath) {
  execFileSync(process.execPath, [cliPath, 'render', fixturePath, '-o', outPath], { stdio: 'pipe' })
}

// ---------------------------------------------------------------------------
// Self-test: the gate must fail on a bad artifact
// ---------------------------------------------------------------------------

function injectPendingPlaceholder(html) {
  return html.replace(
    '<section',
    `<section data-md-diagram-state="loading" data-language-pending="rust" class="mermaid-diagram-pending"`,
  )
}

function stripInlineStyles(html) {
  return html.replace(/\sstyle\s*=\s*(["'])[\s\S]*?\1/gi, '')
}

function truncateArtifact(html) {
  return html.slice(0, Math.floor(html.length / 2))
}

function runSelfTest(args) {
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'verify-snapshot-selftest-'))
  let exit = 0
  try {
    const renderedPath = resolve(tmpDir, 'rendered.html')
    renderFixture(args.cli, args.fixture, renderedPath)
    const rendered = readFileSync(renderedPath, 'utf-8')
    const snapshot = readFileSync(args.snapshot, 'utf-8')

    const cases = [
      ['pending placeholder injection', injectPendingPlaceholder(rendered), 'pending placeholder'],
      ['inline style stripping', stripInlineStyles(rendered), 'inline styles'],
      ['truncation', truncateArtifact(rendered), null],
    ]
    for (const [name, mutant, expectFragment] of cases) {
      const reasons = evaluateArtifact(mutant, snapshot)
      const failed = reasons.length > 0
      const hit = expectFragment ? reasons.some(r => r.includes(expectFragment)) : true
      if (!failed || !hit) {
        console.error(`[self-test] FAIL: ${name} did not fail the gate (reasons: ${JSON.stringify(reasons)})`)
        exit = 1
        continue
      }
      console.log(`[self-test] PASS: ${name} -> gate fails (${reasons.length} reason(s), first: ${reasons[0]})`)
    }
  }
  catch (err) {
    console.error(`[self-test] ERROR: ${err.message}`)
    exit = 1
  }
  finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
  return exit
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv)
  if (args.selfTest) {
    process.exit(runSelfTest(args))
  }
  if (!existsSync(args.cli)) {
    console.error(`[verify-snapshot] CLI bundle not found at ${args.cli}`)
    console.error(`[verify-snapshot] Run \`pnpm --filter @dane.dai/md-web-cli build\` first (or pass --cli <path>).`)
    process.exit(1)
  }
  if (!existsSync(args.fixture)) {
    console.error(`[verify-snapshot] Fixture not found at ${args.fixture}`)
    process.exit(1)
  }
  if (!existsSync(args.snapshot)) {
    console.error(`[verify-snapshot] Golden snapshot not found at ${args.snapshot}`)
    console.error(`[verify-snapshot] Regenerate it with \`pnpm oracle:refresh-snapshot\`.`)
    process.exit(1)
  }

  const tmpDir = mkdtempSync(resolve(tmpdir(), 'verify-snapshot-'))
  let reasons
  try {
    const renderedPath = resolve(tmpDir, 'rendered.html')
    try {
      renderFixture(args.cli, args.fixture, renderedPath)
    }
    catch (err) {
      console.error(`[verify-snapshot] FAIL: CLI render exited non-zero: ${err.message}`)
      process.exit(1)
    }
    const rendered = readFileSync(renderedPath, 'utf-8')
    const snapshot = readFileSync(args.snapshot, 'utf-8')
    reasons = evaluateArtifact(rendered, snapshot)
  }
  finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }

  if (reasons.length > 0) {
    console.error(`[verify-snapshot] FAIL: ${reasons.length} reason(s):`)
    for (const r of reasons)
      console.error(`  - ${r}`)
    process.exit(1)
  }
  console.log('[verify-snapshot] PASS: render exit 0, no pending placeholders, inline styles intact, snapshot matches semantically')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main()
