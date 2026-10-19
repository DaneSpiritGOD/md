/**
 * Semantic diff for Tier 1 acceptance (ticket 07).
 *
 * Compares the browser Oracle (WeChat copy-flow output, ticket 06) against
 * the CLI's WeChat-ready output (ticket 04/05) at the property level, not the
 * raw-HTML level: the Oracle carries class/id attributes and the CLI strips
 * them by design, so a raw diff is meaningless noise. This script extracts
 * key visual properties per element type from inline styles (both outputs are
 * post-juice, so everything relevant is inline) and compares them with
 * tolerance (numeric within a percentage, colors normalized to rgb with a
 * small per-channel delta).
 *
 * Usage:
 *   node scripts/oracle/semantic-diff.mjs [--oracle <html>] [--cli <html>] [--out <dir>]
 *
 * Defaults: oracle at packages/md-web-cli/oracle/oracle.html, CLI output
 * re-rendered from fixtures/full.md via packages/md-web-cli/dist/cli.js.
 * Writes semantic-diff-report.md and semantic-diff-report.json to --out
 * (default docs/evidence/md-web-cli-tier1) and exits non-zero on any
 * unexplained difference.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
// jsdom is a devDependency of the md-web-cli package; load it from there to
// avoid a duplicate install at the repo root.
const require = createRequire(import.meta.url)
// eslint-disable-next-line antfu/no-import-node-modules-by-path
const { JSDOM } = require('../../packages/md-web-cli/node_modules/jsdom')

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')
const DEFAULT_ORACLE = resolve(REPO_ROOT, 'packages/md-web-cli/oracle/oracle.html')
const DEFAULT_CLI = resolve(REPO_ROOT, 'packages/md-web-cli/dist/cli.js')
const DEFAULT_OUT = resolve(REPO_ROOT, 'docs/evidence/md-web-cli-tier1')

// ---------------------------------------------------------------------------
// Tolerance helpers
// ---------------------------------------------------------------------------

/** Numeric tolerance for px/size comparisons: 1% relative or 0.5px absolute. */
const NUMERIC_REL_TOLERANCE = 0.01
const NUMERIC_ABS_TOLERANCE = 0.5
/** Per-channel rgb delta tolerated after normalization (hex -> rgb, case, spacing). */
const COLOR_CHANNEL_TOLERANCE = 0

function parseArgs(argv) {
  const args = { oracle: DEFAULT_ORACLE, cli: DEFAULT_CLI, out: DEFAULT_OUT }
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '')
    const value = argv[i + 1]
    if (key in args && value)
      args[key] = resolve(process.cwd(), value)
  }
  return args
}

/** Parse a css color to { r, g, b, alpha } or null when unparseable. */
export function parseColor(value) {
  if (!value)
    return null
  const v = value.trim().toLowerCase()
  let m = v.match(/^#([0-9a-f]{3})$/)
  if (m) {
    const [r, g, b] = m[1].split('').map(c => Number.parseInt(c + c, 16))
    return { r, g, b, a: 1 }
  }
  m = v.match(/^#([0-9a-f]{6})$/)
  if (m) {
    return {
      r: Number.parseInt(m[1].slice(0, 2), 16),
      g: Number.parseInt(m[1].slice(2, 4), 16),
      b: Number.parseInt(m[1].slice(4, 6), 16),
      a: 1,
    }
  }
  m = v.match(/^rgba?\(([^)]+)\)$/)
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean)
    const rgb = parts.slice(0, 3).map(p => Number.parseFloat(p))
    const a = parts[3] !== undefined ? Number.parseFloat(parts[3]) : 1
    if (rgb.every(n => !Number.isNaN(n)))
      return { r: rgb[0], g: rgb[1], b: rgb[2], a }
  }
  return null
}

/** Compare two color-ish values with channel tolerance; non-colors fall back to string compare. */
export function colorsMatch(a, b) {
  if (a === b)
    return true
  const ca = parseColor(a)
  const cb = parseColor(b)
  if (!ca || !cb)
    return false
  const d = Math.max(Math.abs(ca.r - cb.r), Math.abs(ca.g - cb.g), Math.abs(ca.b - cb.b))
  return d <= COLOR_CHANNEL_TOLERANCE && Math.abs(ca.a - cb.a) <= 0.01
}

/** Extract the first px-ish number from a value like `19.2px` or `0 1em`. */
function firstNumber(value) {
  if (!value)
    return null
  const m = value.match(/(-?\d+(?:\.\d+)?)(px|em|rem|%)/)
  return m ? Number.parseFloat(m[1]) : null
}

/** Compare two (possibly css-length) values numerically where possible. */
export function valuesMatch(a, b) {
  if (a === b)
    return true
  const na = firstNumber(a)
  const nb = firstNumber(b)
  if (na === null || nb === null)
    return false
  const scale = Math.max(Math.abs(na), Math.abs(nb), 1)
  return Math.abs(na - nb) <= Math.max(NUMERIC_ABS_TOLERANCE, scale * NUMERIC_REL_TOLERANCE)
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function makeGrabber(el) {
  const raw = el.getAttribute('style') ?? ''
  const grab = (prop) => {
    const m = raw.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'))
    return m ? m[1].trim() : null
  }
  return grab
}

/**
 * Extract key visual properties per element type from one HTML document.
 * Both sides are post-juice inline-style documents, so inline styles carry
 * everything the comparison needs; computed styles are not required.
 */
export function extractProperties(html) {
  const doc = new JSDOM(html).window.document
  const root = doc.body
  const pick = (selector, props) => {
    const el = root.querySelector(selector)
    if (!el)
      return null
    const grab = makeGrabber(el)
    const out = {}
    for (const p of props)
      out[p] = grab(p)
    return out
  }
  const heading = tag => pick(tag, ['color', 'background', 'font-size', 'text-align', 'border-left', 'border-bottom'])
  return {
    container: pick('section', ['color', 'font-size', 'line-height', 'font-family']),
    h1: heading('h1'),
    h2: heading('h2'),
    h3: heading('h3'),
    h4: heading('h4'),
    h5: heading('h5'),
    h6: heading('h6'),
    blockquote: pick('blockquote', ['border-left', 'border-radius', 'padding', 'background', 'color', 'font-style']),
    pre: pick('pre', ['color', 'background', 'border-radius', 'line-height', 'margin', 'padding']),
    macSign: pick('pre span', ['display', 'padding']),
    strong: pick('strong', ['color', 'font-weight', 'font-size']),
    codespan: pick('p code', ['color', 'background', 'border-radius', 'font-size']),
    link: pick('a', ['color', 'text-decoration']),
    li: pick('li', ['display', 'margin', 'color']),
    ul: pick('ul', ['list-style', 'padding-left', 'color']),
    ol: pick('ol', ['padding-left', 'color']),
    table: pick('table', ['color', 'border-collapse']),
    th: pick('th', ['border', 'padding', 'color', 'background', 'text-align']),
    td: pick('td', ['border', 'padding', 'color', 'text-align']),
    figcaption: pick('figcaption', ['text-align', 'color', 'font-size']),
    hr: pick('hr', ['border-style', 'border-width', 'border-color', 'height']),
    em: pick('em', ['font-style', 'font-size']),
    del: pick('del', ['color', 'text-decoration']),
    counts: {
      h1: root.querySelectorAll('h1').length,
      h2: root.querySelectorAll('h2').length,
      h3: root.querySelectorAll('h3').length,
      pre: root.querySelectorAll('pre').length,
      blockquote: root.querySelectorAll('blockquote').length,
      table: root.querySelectorAll('table').length,
      li: root.querySelectorAll('li').length,
      strong: root.querySelectorAll('strong').length,
    },
    hasStyleTag: !!doc.querySelector('style'),
    hasClassAttributes: /\sclass\s*=\s*["']/.test(html),
    zeroFontSizeBrackets: root.querySelectorAll('p[style*="font-size: 0px"]').length,
  }
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------
/**
 * Classify a raw-HTML-level difference between the two documents.
 * Returns one of the known/accepted difference classes or 'unexplained'.
 */
export function classifyRawDifference(oracleHtml, cliHtml) {
  // Strip accepted deltas, then compare token streams.
  const strip = (html) => {
    let s = html
    // Oracle carries an HTML comment header; drop comments on both sides.
    s = s.replace(/<!--[\s\S]*?-->/g, '')
    // Class and auto heading-id attributes: present in Oracle, stripped in CLI.
    s = s.replace(/\sclass="[^"]*"/g, '')
    s = s.replace(/\sid="\d+"/g, '')
    // Inline body color: CLI writes it explicitly; Oracle inherits it from body.
    s = s.replace(/\s?color:\s*rgb\(10,\s?10,\s?10\);?/g, '')
    // Table margin-top reset: WeChat paste-side detail present in the Oracle only.
    s = s.replace(/\s?margin-top:\s*0\s?!important;?/g, '')
    // SVG dimension unit suffix: 45 vs 45px are equivalent in SVG2+css contexts.
    s = s.replace(/(width|height)="(\d+(?:\.\d+)?)px"/g, '$1="$2"')
    // overflow="visible" on the mac-sign SVG is the default the browser copy
    // flow emits explicitly and the CLI omits; equivalent rendering.
    s = s.replace(/\soverflow="visible"/g, '')
    // Trailing slash on void-ish link href normalization.
    s = s.replace(/href="https:\/\/example\.com\/"/g, 'href="https://example.com"')
    // Whitespace between tags.
    return s.replace(/>\s+</g, '><').trim()
  }
  return strip(oracleHtml) === strip(cliHtml) ? 'all differences classified' : 'unexplained raw differences remain'
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function compareProperty(section, prop, oracleValue, cliValue) {
  if (oracleValue === null && cliValue === null)
    return { section, prop, status: 'match', oracle: null, cli: null }
  if (oracleValue === null || cliValue === null)
    return { section, prop, status: 'fail', oracle: oracleValue, cli: cliValue, note: 'present on one side only' }
  if (colorsMatch(oracleValue, cliValue))
    return { section, prop, status: 'match', oracle: oracleValue, cli: cliValue }
  if (valuesMatch(oracleValue, cliValue))
    return { section, prop, status: 'match', oracle: oracleValue, cli: cliValue, note: 'numeric within tolerance' }
  return { section, prop, status: 'fail', oracle: oracleValue, cli: cliValue }
}

function compareStructural(oracle, cli) {
  const results = []
  for (const key of ['hasStyleTag', 'hasClassAttributes', 'zeroFontSizeBrackets']) {
    results.push({ section: 'structural', prop: key, oracle: oracle[key], cli: cli[key] })
  }
  for (const [tag, count] of Object.entries(oracle.counts)) {
    results.push({
      section: 'counts',
      prop: tag,
      oracle: count,
      cli: cli.counts[tag],
      status: count === cli.counts[tag] ? 'match' : 'fail',
    })
  }
  return results
}

export function buildReport(oracleHtml, cliHtml) {
  const oracle = extractProperties(oracleHtml)
  const cli = extractProperties(cliHtml)
  const results = []
  for (const [section, props] of Object.entries(oracle)) {
    if (section === 'counts' || section === 'hasStyleTag' || section === 'hasClassAttributes' || section === 'zeroFontSizeBrackets')
      continue
    const cliProps = cli[section]
    results.push({
      section,
      status: (props === null) !== (cliProps === null) ? 'fail' : undefined,
      presence: { oracle: props !== null, cli: cliProps !== null },
    })
    if (props && cliProps) {
      for (const prop of Object.keys(props)) {
        results.push(compareProperty(section, prop, props[prop], cliProps[prop]))
      }
    }
  }
  results.push(...compareStructural(oracle, cli))
  // Container color: the single accepted "present on one side only" property
  // (CLI inlines rgb(10,10,10); Oracle inherits it from the editor page body).
  // Mark it explicitly instead of counting it as a failure.
  for (const r of results) {
    if (r.section === 'container' && r.prop === 'color' && r.status === 'fail')
      r.status = 'accepted'
  }
  const rawClassification = classifyRawDifference(oracleHtml, cliHtml)
  const failures = results.filter(r => r.status === 'fail')
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      matches: results.filter(r => r.status === 'match').length,
      failures: failures.length,
      structural: results.filter(r => r.section === 'structural' || r.section === 'counts'),
      rawClassification,
    },
    results,
    failures,
    explainedDifferences: [
      {
        topic: 'class and auto heading-id attributes',
        detail: 'The Oracle is the browser copy-flow output and keeps class="..." / id="N" attributes; the CLI strips them by design for WeChat (copy flow strips classes after juice). All such hunks are accepted.',
      },
      {
        topic: 'inline body color on the container',
        detail: 'The CLI writes color: rgb(10,10,10) inline on the root section; the Oracle inherits the same value from the page body element (it never becomes an inline declaration). Decision recorded in the ticket: body text color settles at rgb(10,10,10) to match the browser baseline.',
      },
      {
        topic: 'table margin-top reset',
        detail: 'The Oracle table carries margin-top: 0 !important (paste-side reset in the browser flow); the CLI omits it. Visual impact is nil because the preceding heading already sets margin-bottom.',
      },
      {
        topic: 'SVG width/height unit suffix',
        detail: 'Mac code-block dots SVG: Oracle has width="45" height="13"; CLI emits width="45px" height="13px". Equivalent rendering in Chromium/WeChat.',
      },
      {
        topic: 'link href trailing slash',
        detail: 'The browser copy flow normalizes https://example.com to https://example.com/ via URL parsing; the CLI keeps the Markdown-authored form. Same target.',
      },
      {
        topic: 'mac-sign SVG overflow attribute',
        detail: 'The Oracle mac-sign SVG carries overflow="visible" (the default, emitted explicitly by the browser copy flow); the CLI omits it. Same rendered result.',
      },
      {
        topic: 'container color presence',
        detail: 'The CLI writes color: rgb(10,10,10) inline on the root section; the Oracle has no inline color because the value is inherited from the page body element of the editor page. In a plain rendering context (no editor CSS) the Oracle section computes rgb(0,0,0) while the CLI computes rgb(10,10,10) — verified headlessly with computed styles; the delta is imperceptible (all channels 10/255). Ticket 07 decision: body text color settles at rgb(10,10,10) to match the editor\u2019s browser baseline, which is what WeChat readers effectively see in the copy flow.',
      },
      {
        topic: 'Oracle HTML comment header',
        detail: 'The Oracle file starts with a provenance comment; the CLI output has none.',
      },
    ],
    pendingHumanCheck: 'PENDING HUMAN CHECK — side-by-side paste into WeChat of Oracle vs CLI output on a real device; conclusion to be recorded in the report by the human.',
  }
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function renderMarkdown(report, oraclePath, cliHtmlPath) {
  const lines = []
  lines.push(`# Tier 1 semantic diff report (ticket 07)`)
  lines.push('')
  lines.push(`Generated: ${report.generatedAt}`)
  lines.push('')
  lines.push(`- Oracle: \`${oraclePath}\` (browser copy-flow output, ticket 06 pipeline)`)
  lines.push(`- CLI: \`${cliHtmlPath}\` (rendered by \`packages/md-web-cli/dist/cli.js\` from \`fixtures/full.md\`)`)
  lines.push(`- Compared properties: ${report.summary.total}, matched: ${report.summary.matches}, failures: ${report.summary.failures}`)
  lines.push(`- Raw-level classification: **${report.summary.rawClassification}**`)
  lines.push('')
  lines.push(`## Structural / counts`)
  lines.push('')
  lines.push(`| kind | prop | Oracle | CLI | status |`)
  lines.push(`| --- | --- | --- | --- | --- |`)
  for (const r of report.summary.structural) {
    lines.push(`| ${r.section} | ${r.prop} | ${JSON.stringify(r.oracle)} | ${JSON.stringify(r.cli)} | ${r.status ?? 'info'} |`)
  }
  lines.push('')
  lines.push(`## Property comparison`)
  lines.push('')
  lines.push(`| section | prop | Oracle | CLI | status | note |`)
  lines.push(`| --- | --- | --- | --- | --- | --- |`)
  for (const r of report.results) {
    if (r.status === undefined)
      continue
    const note = r.note ?? ''
    lines.push(`| ${r.section} | ${r.prop} | ${r.oracle ?? '—'} | ${r.cli ?? '—'} | ${r.status} | ${note} |`)
  }
  lines.push('')
  lines.push(`## Explained differences`)
  lines.push('')
  for (const d of report.explainedDifferences) {
    lines.push(`- **${d.topic}** — ${d.detail}`)
  }
  lines.push('')
  lines.push(`## PENDING HUMAN CHECK`)
  lines.push('')
  lines.push(`- ${report.pendingHumanCheck}`)
  lines.push(`- Manual instructions: see \`manual-wechat-check.md\` next to this report.`)
  lines.push('')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv)
  if (!existsSync(args.oracle)) {
    console.error(`[semantic-diff] Oracle not found at ${args.oracle}`)
    console.error(`[semantic-diff] Run \`pnpm oracle\` first (ticket 06) or pass --oracle <path>.`)
    process.exit(1)
  }
  const oracleHtml = readFileSync(args.oracle, 'utf-8')
  let cliHtmlPath
  let cliHtml
  if (args.cli.endsWith('.html')) {
    cliHtmlPath = args.cli
    cliHtml = readFileSync(cliHtmlPath, 'utf-8')
  }
  else {
    const tmpDir = resolve(args.out, '.tmp-cli-render')
    mkdirSync(tmpDir, { recursive: true })
    cliHtmlPath = resolve(tmpDir, 'cli-output.html')
    execFileSync(process.execPath, [args.cli, 'render', resolve(REPO_ROOT, 'packages/md-web-cli/fixtures/full.md'), '-o', cliHtmlPath], { stdio: 'inherit' })
    cliHtml = readFileSync(cliHtmlPath, 'utf-8')
  }

  const report = buildReport(oracleHtml, cliHtml)
  mkdirSync(args.out, { recursive: true })
  const jsonPath = resolve(args.out, 'semantic-diff-report.json')
  const mdPath = resolve(args.out, 'semantic-diff-report.md')
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(mdPath, renderMarkdown(report, args.oracle, cliHtmlPath))
  console.log(`[semantic-diff] matches=${report.summary.matches} failures=${report.summary.failures} raw=${report.summary.rawClassification}`)
  console.log(`[semantic-diff] wrote ${mdPath}`)
  console.log(`[semantic-diff] wrote ${jsonPath}`)
  if (report.summary.failures > 0 || report.summary.rawClassification !== 'all differences classified') {
    console.error('[semantic-diff] FAILED: unexplained differences found')
    process.exit(1)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
