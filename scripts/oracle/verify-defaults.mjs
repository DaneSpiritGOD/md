/**
 * Tier 1 defaults verification (ticket 07).
 *
 * Asserts the CLI's site-default configuration against the defaults the web
 * app actually ships, and against the rendered output itself:
 *   - mac code block ON
 *   - `github-dark` highlighting
 *   - 16px font / 1.75 line-height / 1x block spacing
 *   - primary color #0F4C81
 *   - link color #576b95
 *   - legend `alt`
 *   - body text color rgb(10,10,10) (settled in ticket 07 to match the
 *     browser baseline where the value is inherited from body)
 *
 * Run: node scripts/oracle/verify-defaults.mjs
 * Exits non-zero on any assertion failure.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// jsdom is a devDependency of the md-web-cli package; load it from there to
// avoid a duplicate install at the repo root.
const require = createRequire(import.meta.url)
// eslint-disable-next-line antfu/no-import-node-modules-by-path
const { JSDOM } = require('../../packages/md-web-cli/node_modules/jsdom')

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')
const CLI_HTML = resolve(REPO_ROOT, 'docs/evidence/md-web-cli-tier1/cli-output.html')
const SHARED_STYLE_PATH = resolve(REPO_ROOT, 'packages/shared/src/configs/style.ts')

const failures = []
function check(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok)
    failures.push({ name, detail })
}

// ---------------------------------------------------------------------------
// 1. Site default style config cross-check
//
// defaultStyleConfig references option arrays by index (fontSizeOptions[2]
// etc.), so resolve the same way statically instead of pattern-matching
// literal values.
// ---------------------------------------------------------------------------

const sharedStyleSource = readFileSync(SHARED_STYLE_PATH, 'utf-8')

function extractArray(name) {
  const m = sharedStyleSource.match(new RegExp(`(?:export const |const )${name}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\]`))
  if (!m)
    return null
  return [...m[1].matchAll(/value:\s*(?:`([^`]*)`|'([^']*)')/g)].map(x => x[1] ?? x[2])
}

// codeBlockThemeList is a bare string array feeding codeBlockThemeOptions.
const themeListMatch = sharedStyleSource.match(/const codeBlockThemeList\s*=\s*\[([\s\S]*?)\n\]/)
const codeBlockThemeList = themeListMatch ? [...themeListMatch[1].matchAll(/`([^`]*)`/g)].map(x => x[1]) : []

const fontSizeOptions = extractArray('fontSizeOptions')
const lineHeightOptions = extractArray('lineHeightOptions')
const blockSpacingOptions = extractArray('blockSpacingOptions')
const colorOptions = extractArray('colorOptions')
const linkColorOptions = extractArray('linkColorOptions')
const legendOptions = extractArray('legendOptions')

const site = {
  isMacCodeBlock: /isMacCodeBlock:\s*true/.test(sharedStyleSource.split('defaultStyleConfig')[1] ?? ''),
  fontSize: fontSizeOptions?.[2],
  lineHeight: lineHeightOptions?.[2],
  blockSpacing: blockSpacingOptions?.[2],
  primaryColor: colorOptions?.[0],
  linkColor: linkColorOptions?.[0],
  codeBlockTheme: codeBlockThemeList[23],
  legend: legendOptions?.[3],
}

check('site defaultStyleConfig: isMacCodeBlock true', site.isMacCodeBlock === true, `site=${site.isMacCodeBlock}`)
check('site defaultStyleConfig: codeBlockTheme github-dark', site.codeBlockTheme === 'github-dark', `site=${site.codeBlockTheme}`)
check('site defaultStyleConfig: fontSize 16px', site.fontSize === '16px', `site=${site.fontSize}`)
check('site defaultStyleConfig: lineHeight 1.75', site.lineHeight === '1.75', `site=${site.lineHeight}`)
check('site defaultStyleConfig: blockSpacing 1', site.blockSpacing === '1', `site=${site.blockSpacing}`)
check('site defaultStyleConfig: primaryColor #0F4C81', site.primaryColor === '#0F4C81', `site=${site.primaryColor}`)
check('site defaultStyleConfig: linkColor #576b95', site.linkColor === '#576b95', `site=${site.linkColor}`)
check('site defaultStyleConfig: legend alt', site.legend === 'alt', `site=${site.legend}`)

// ---------------------------------------------------------------------------
// 2. Rendered CLI output carries every default
// ---------------------------------------------------------------------------

const html = readFileSync(CLI_HTML, 'utf-8')
const doc = new JSDOM(html).window.document
const root = doc.body
function grab(el, prop) {
  if (!el)
    return null
  const m = (el.getAttribute('style') ?? '').match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'))
  return m ? m[1].trim() : null
}

const container = root.querySelector('section')
check('output: container font-size 16px', grab(container, 'font-size') === '16px', `got ${grab(container, 'font-size')}`)
check('output: container line-height 1.75', grab(container, 'line-height') === '1.75', `got ${grab(container, 'line-height')}`)
check('output: container body color rgb(10,10,10)', grab(container, 'color') === 'rgb(10,10,10)', `got ${grab(container, 'color')}`)

const h2 = root.querySelector('h2')
check('output: h2 background #0F4C81', grab(h2, 'background') === '#0F4C81', `got ${grab(h2, 'background')}`)

const link = root.querySelector('a')
check('output: link color #576b95', grab(link, 'color') === '#576b95', `got ${grab(link, 'color')}`)

// Mac code block: each pre starts with a flex mac-sign span holding the dots SVG.
const macSpans = root.querySelectorAll('pre > span')
let macOn = macSpans.length > 0
for (const span of macSpans) {
  if (!span.querySelector('svg'))
    macOn = false
}
const pres = root.querySelectorAll('pre')
check('output: mac code block on (dots SVG in every pre)', macOn && macSpans.length === pres.length, `${macSpans.length}/${pres.length} pres`)

// github-dark: pre background #0d1117 with #c9d1d9 foreground and hljs token colors.
const pre = root.querySelector('pre')
check('output: code block background #0d1117 (github-dark)', grab(pre, 'background') === '#0d1117', `got ${grab(pre, 'background')}`)
check('output: code block color #c9d1d9 (github-dark)', grab(pre, 'color') === '#c9d1d9', `got ${grab(pre, 'color')}`)
const keyword = root.querySelector('pre span[style*="#ff7b72"]')
check('output: github-dark keyword color present', !!keyword)

// Legend alt: figure captions carry the image alt text.
const captions = [...root.querySelectorAll('figcaption')].map(el => el.textContent.trim())
check('output: legend alt (figcaption shows alt text)', captions.length === 2 && captions[0] === 'Fixture landscape' && captions[1] === 'Fixture portrait', captions.join(' | '))

// ---------------------------------------------------------------------------
// 3. CLI source defaults mirror the site config
// ---------------------------------------------------------------------------

const defaultsSource = readFileSync(resolve(REPO_ROOT, 'packages/md-web-cli/src/defaults.ts'), 'utf-8')
check('cli defaults: isMacCodeBlock true', /isMacCodeBlock:\s*true/.test(defaultsSource))
check('cli defaults: codeBlockTheme github-dark', /codeBlockTheme:\s*'github-dark'/.test(defaultsSource))
check('cli defaults: fontSize 16px', /fontSize:\s*'16px'/.test(defaultsSource))
check('cli defaults: lineHeight 1.75', /lineHeight:\s*'1\.75'/.test(defaultsSource))
check('cli defaults: blockSpacing 1', /blockSpacing:\s*'1'/.test(defaultsSource))
check('cli defaults: primaryColor #0F4C81', /primaryColor:\s*'#0F4C81'/.test(defaultsSource))
check('cli defaults: linkColor #576b95', /linkColor:\s*'#576b95'/.test(defaultsSource))
check('cli defaults: legend alt', /legend:\s*'alt'/.test(defaultsSource))

if (failures.length > 0) {
  console.error(`\n[verify-defaults] ${failures.length} failure(s)`)
  process.exit(1)
}
console.log('\n[verify-defaults] all defaults verified')
