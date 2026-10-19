/**
 * Shared semantic property extraction for the Tier 1/2 oracle scripts.
 *
 * Extracted from scripts/oracle/semantic-diff.mjs (ticket 07) so that both
 * the semantic diff and the golden-snapshot verifier (ticket 08) compare
 * documents with exactly the same tolerance rules and property set. The
 * jsdom dependency is loaded from the md-web-cli package's own node_modules
 * to avoid a duplicate install at the repo root.
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// eslint-disable-next-line antfu/no-import-node-modules-by-path
const { JSDOM } = require('../../../packages/md-web-cli/node_modules/jsdom')

// ---------------------------------------------------------------------------
// Tolerance helpers
// ---------------------------------------------------------------------------

/** Numeric tolerance for px/size comparisons: 1% relative or 0.5px absolute. */
export const NUMERIC_REL_TOLERANCE = 0.01
export const NUMERIC_ABS_TOLERANCE = 0.5
/** Per-channel rgb delta tolerated after normalization (hex -> rgb, case, spacing). */
export const COLOR_CHANNEL_TOLERANCE = 0

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
 * Both compared documents are post-juice inline-style documents, so inline
 * styles carry everything the comparison needs; computed styles are not
 * required.
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
