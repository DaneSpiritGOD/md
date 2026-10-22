/**
 * Non-browser assertions the gate owns.
 *
 * These are the invariants the retired verifier enforced, kept alive so they do
 * not die with the script that used to host them: the CLI's output must carry no
 * pending async placeholders, and it must be WeChat-ready (no style block, no
 * class attributes, inline styles on block-level elements).
 *
 * They run against the CLI output only. The browser's clipboard HTML is
 * pre-paste and legitimately keeps class attributes; WeChat strips them at paste
 * time. Asserting WeChat readiness on that side would be asserting the wrong
 * artefact's contract.
 */

/** Elements WeChat formats structurally; they legitimately carry no style attr. */
const STYLE_EXEMPT = new Set([`tr`, `tbody`, `thead`, `svg`])

const BLOCK_TAGS = new Set([
  `section`,
  `p`,
  `h1`,
  `h2`,
  `h3`,
  `h4`,
  `h5`,
  `h6`,
  `blockquote`,
  `table`,
  `pre`,
  `ul`,
  `ol`,
  `li`,
  `td`,
  `th`,
  `figure`,
  `figcaption`,
  `hr`,
  `div`,
  `details`,
  `summary`,
])

/**
 * Scan for pending-async markers.
 *
 * Leading style blocks are stripped first so a legitimate CSS selector such as
 * `.katex-pending` never reads as pending content.
 */
export function findPendingPlaceholders(html) {
  const body = html.replace(/<style[\s\S]*?<\/style>/gi, ``)
  const found = []
  if (/<div[^>]*data-md-diagram-state="loading"/.test(body))
    found.push({ kind: `pending-diagram`, detail: `async diagram placeholder (data-md-diagram-state="loading")` })
  if (/<[^>]*\bkatex-pending\b/.test(body))
    found.push({ kind: `pending-katex`, detail: `KaTeX formula placeholder (.katex-pending)` })
  for (const match of body.matchAll(/data-language-pending="([^"]*)"/g))
    found.push({ kind: `pending-language`, detail: `unregistered code language placeholder (${match[1]})` })
  return found
}

/**
 * Scan for output that is not WeChat-ready.
 *
 * The exemptions are a documented product rule, not a convenience: WeChat
 * formats table sections, rows, and SVG structurally, so demanding an inline
 * style on them would report a difference that does not exist. The full
 * fixture contains tables, so the baseline render in the self-test fails if
 * these stop being honoured.
 */
export function findInlineStyleProblems(html) {
  const problems = []
  if (/<style[\s>]/i.test(html))
    problems.push({ kind: `style-tag`, detail: `document contains a <style> block` })

  const classCount = (html.match(/\sclass\s*=\s*(["'])/gi) ?? []).length
  if (classCount > 0)
    problems.push({ kind: `class-attribute`, detail: `document contains ${classCount} class attribute(s)` })

  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
    const tag = match[1].toLowerCase()
    const attrs = match[2] ?? ``
    if (!BLOCK_TAGS.has(tag) || STYLE_EXEMPT.has(tag))
      continue
    if (!/\sstyle\s*=/i.test(attrs))
      problems.push({ kind: `unstyled-block`, detail: `<${tag}> block element without a style attribute` })
  }
  return problems
}

/** All non-browser problems for one rendered artifact. */
export function findStructuralProblems(html) {
  return [...findPendingPlaceholders(html), ...findInlineStyleProblems(html)]
}
