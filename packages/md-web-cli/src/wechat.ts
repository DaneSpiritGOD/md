/**
 * WeChat-ready output pipeline for md-web-cli.
 *
 * CSS inlining + WeChat post-processing vendored from the official copy flow in
 * apps/web/src/services/export/clipboard.ts and clipboard-dom.ts (juice options,
 * nested-list hoisting, img width/height -> inline style, zero-font-size
 * paragraph bracketing, hsl()/var() literal resolution). Vendored — not imported
 * — so this package never depends on apps/web.
 *
 * Also detects pending async placeholders (mermaid / KaTeX / infographic /
 * unregistered code languages) so the CLI can fail loudly instead of silently
 * stripping them.
 */
import type { RenderConfigInput } from './types'
import process from 'node:process'
import { JSDOM } from 'jsdom'
import juice from 'juice'
import { siteDefaultRenderConfig } from './defaults'
import { renderMarkdownToStyledHtml } from './render'

const JUICE_OPTIONS = {
  inlinePseudoElements: true,
  preserveImportant: true,
  resolveCSSVariables: false,
} as const

// ---------------------------------------------------------------------------
// Vendored from apps/web/src/services/export/clipboard-dom.ts
// ---------------------------------------------------------------------------

const GENERIC_FONT_FAMILIES = /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|inherit|initial|unset|revert|revert-layer)$/i

/** Mermaid may emit `style="undefined;"` on edges; juice's CSS parser then throws. */
function isUndefinedCssValue(value: string): boolean {
  const normalized = value.replace(/\s*!important$/i, ``).trim()
  return !normalized || /^undefined$/i.test(normalized) || /\bundefined\b/i.test(normalized)
}

function mapFontFamilyName(family: string): string {
  const unquoted = family.replace(/["']/g, ``).trim()
  if (!unquoted)
    return family
  if (/^var\(/i.test(family))
    return family
  if (GENERIC_FONT_FAMILIES.test(unquoted))
    return unquoted
  // Quote multi-word / CJK names so juice/PostCSS can parse them.
  if (/\s/.test(unquoted) || unquoted.split(``).some(ch => ch.charCodeAt(0) > 127))
    return `'${unquoted}'`
  return unquoted
}

function quoteFontFamilyList(value: string): string {
  return value
    .split(/,(?=(?:[^'"]|'[^']*'|"[^"]*")*$)/)
    .map(part => mapFontFamilyName(part.trim()))
    .filter(Boolean)
    .join(`, `)
}

/** C4 / sequence / gantt default to unquoted `Open Sans`, which juice/PostCSS rejects. */
function quoteUnquotedFontFamilies(css: string): string {
  return css
    .replace(/font-family\s*:\s*([^;}{]+)/gi, (_, value: string) => `font-family: ${quoteFontFamilyList(value)}`)
    .replace(/(?<!['"])\bOpen Sans\b(?!['"])/gi, `sans-serif`)
}

function decodeStyleAttr(value: string): string {
  return value
    .replace(/&quot;/g, `"`)
    .replace(/&#34;/g, `"`)
    .replace(/&apos;|&#39;/g, `'`)
    .replace(/&amp;/g, `&`)
}

function encodeStyleAttr(value: string, quote: string): string {
  let next = value.replace(/&/g, `&amp;`)
  if (quote === `"`)
    next = next.replace(/"/g, `&quot;`)
  else
    next = next.replace(/'/g, `&#39;`)
  return next
}

function sanitizeCssDeclarations(css: string): string {
  const cleaned = css
    .split(`;`)
    .map(part => part.trim())
    .filter((part) => {
      if (!part || /^undefined$/i.test(part))
        return false
      const colon = part.indexOf(`:`)
      if (colon === -1)
        return false
      return !isUndefinedCssValue(part.slice(colon + 1))
    })
    .join(`; `)
  return quoteUnquotedFontFamilies(cleaned)
}

function sanitizeEmbeddedStylesheet(css: string): string {
  return quoteUnquotedFontFamilies(
    css.replace(/([a-z_-]+)\s*:\s*undefined\b\s*;?/gi, ``),
  )
}

/**
 * Quote / drop juice-invalid CSS in the HTML string juice actually parses.
 * (apps/web: sanitizeHtmlCssForJuice)
 */
function sanitizeHtmlCssForJuice(html: string): string {
  const withStyleAttrs = html.replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (_full, quote: string, value: string) => {
    const sanitized = sanitizeCssDeclarations(decodeStyleAttr(value))
    return ` style=${quote}${encodeStyleAttr(sanitized, quote)}${quote}`
  })

  const withSheets = withStyleAttrs.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_full, open: string, css: string, close: string) => {
    return `${open}${sanitizeEmbeddedStylesheet(css)}${close}`
  })

  return withFontAttrs(withSheets)
}

function withFontAttrs(html: string): string {
  return html
    .replace(/\sfont-family\s*=\s*(["'])([\s\S]*?)\1/gi, (_full, quote: string, value: string) => {
      return ` font-family=${quote}${encodeStyleAttr(quoteFontFamilyList(decodeStyleAttr(value)), quote)}${quote}`
    })
    .replace(/(?<!['"])\bOpen Sans\b(?!['"])/gi, `sans-serif`)
}

function stripFontFamilyForJuiceFallback(html: string): string {
  return html
    .replace(/font-family\s*:[^;}{]+;?/gi, ``)
    .replace(/\sfont-family\s*=\s*(["'])[\s\S]*?\1/gi, ``)
    .replace(/(?<!['"])\bOpen Sans\b(?!['"])/gi, `sans-serif`)
}

/** Inlined via the same juice options the official WeChat copy flow uses. */
function mergeCss(html: string): string {
  const sanitized = sanitizeHtmlCssForJuice(html)
  const attempts = [
    () => juice(sanitized, JUICE_OPTIONS),
    () => juice(sanitized, { ...JUICE_OPTIONS, inlinePseudoElements: false }),
    () => juice(stripFontFamilyForJuiceFallback(sanitized), { ...JUICE_OPTIONS, inlinePseudoElements: false }),
  ]

  for (const attempt of attempts) {
    try {
      return attempt()
    }
    catch {
      // Fall through to the next, progressively laxer juice attempt.
    }
  }

  // Every juice attempt failed: returning the un-inlined form would silently
  // ship a non-WeChat-ready artifact (<style> block, no inline styles). The
  // spec's loud-failure spirit says warn on stderr instead of staying quiet.
  process.stderr.write(`md-web-cli: warning - CSS inlining failed after all fallback attempts; output still carries a <style> block and is NOT WeChat-ready\n`)
  return sanitized
}

/**
 * Hoist nested lists out of list items (WeChat drops them otherwise).
 * (apps/web: modifyHtmlStructure)
 */
function hoistNestedLists(html: string): string {
  const root = new JSDOM(html).window.document.body
  root.querySelectorAll(`li > ul, li > ol`).forEach((nested) => {
    nested.parentElement?.insertAdjacentElement(`afterend`, nested)
  })
  return root.innerHTML
}

/** Convert img width/height attributes to inline styles (apps/web: solveWeChatImage). */
function convertImageDimensionsToStyle(html: string): string {
  const root = new JSDOM(html).window.document.body
  root.querySelectorAll(`img`).forEach((image) => {
    const width = image.getAttribute(`width`)
    const height = image.getAttribute(`height`)
    if (width) {
      image.removeAttribute(`width`)
      image.style.width = /^\d+$/.test(width) ? `${width}px` : width
    }
    if (height) {
      image.removeAttribute(`height`)
      image.style.height = /^\d+$/.test(height) ? `${height}px` : height
    }
  })
  return root.innerHTML
}

/**
 * Bracket the output with zero-font-size empty paragraphs so WeChat does not
 * inject its own leading/trailing paragraphs. (apps/web: createEmptyNode)
 */
function bracketWithZeroFontParagraphs(html: string): string {
  const root = new JSDOM(html).window.document.body
  const bracket = root.ownerDocument!.createElement(`p`)
  bracket.style.fontSize = `0`
  bracket.style.lineHeight = `0`
  bracket.style.margin = `0`
  bracket.innerHTML = `&nbsp;`
  root.insertBefore(bracket.cloneNode(true), root.firstChild)
  root.appendChild(bracket.cloneNode(true))
  return root.innerHTML
}

// ---------------------------------------------------------------------------
// Vendored from apps/web/src/services/export/clipboard.ts (var()/hsl() literals)
// ---------------------------------------------------------------------------

export interface WeChatVariableValues {
  primaryColor: string
  fontFamily: string
  fontSize: string
  lineHeight: string
  blockSpacing: string
}

/**
 * Resolve hsl()/var() literals to concrete values — WeChat strips <style> blocks
 * and CSS custom properties on paste.
 */
function resolveCssLiterals(html: string, values: WeChatVariableValues): string {
  return html
    .replace(/([^-])top:(.*?)em/g, `$1transform: translateY($2em)`)
    .replace(/hsl\(var\(--foreground\)\)/g, `#3f3f3f`)
    .replace(/var\(--blockquote-background\)/g, `#f7f7f7`)
    .replace(/var\(--md-primary-color\)/g, values.primaryColor)
    .replace(/var\(--md-font-family\)/g, values.fontFamily)
    .replace(/var\(--md-font-size\)/g, values.fontSize)
    .replace(/var\(--md-line-height\)/g, values.lineHeight)
    .replace(/var\(--md-block-spacing\)/g, values.blockSpacing)
    .replace(/--md-primary-color:.+?;/g, ``)
    .replace(/--md-font-family:.+?;/g, ``)
    .replace(/--md-font-size:.+?;/g, ``)
    .replace(/--md-line-height:.+?;/g, ``)
    .replace(/--md-block-spacing:.+?;/g, ``)
    .replace(/--md-link-color:.+?;/g, ``)
    .replace(/--md-blockquote-background:.+?;/g, ``)
    .replace(
      /<span class="nodeLabel"([^>]*)><p[^>]*>(.*?)<\/p><\/span>/g,
      `<span class="nodeLabel"$1>$2</span>`,
    )
    .replace(
      /<span class="edgeLabel"([^>]*)><p[^>]*>(.*?)<\/p><\/span>/g,
      `<span class="edgeLabel"$1>$2</span>`,
    )
}

/** WeChat-ready HTML must carry no class attributes and no <style> block. */
function stripClassAttributes(html: string): string {
  return html.replace(/\sclass\s*=\s*(["'])[\s\S]*?\1/gi, ``)
}

// ---------------------------------------------------------------------------
// Pending placeholder detection
// ---------------------------------------------------------------------------

export interface PendingPlaceholder {
  /** Human-readable kind, e.g. "mermaid diagram", "unregistered code language". */
  kind: string
  /** What exactly is pending (language name, block class, ...). */
  detail: string
  /** How the user can resolve it. */
  wayForward: string
}

const WAY_FORWARD_DIAGRAM = `render the diagram manually (e.g. in the doocs/md web app) and paste the resulting SVG/HTML, or fall back to the browser backend temporarily`
const WAY_FORWARD_MATH = `render the formula manually (e.g. in the doocs/md web app) and paste the resulting HTML, or fall back to the browser backend temporarily`
const WAY_FORWARD_LANGUAGE = `register the language via a supported highlight theme, use a registered language (bash, css, javascript, json, markdown, plaintext, python, shell, typescript, xml), or fall back to the browser backend temporarily`

/**
 * Scan rendered HTML for pending async placeholders. The renderer marks them
 * with data-md-diagram-state="loading" (mermaid/plantuml/infographic),
 * katex-pending elements (KaTeX before MathJax resolves) and
 * data-language-pending (code languages whose highlight.js grammar is not
 * bundled). Scans the DOM body — the theme CSS legitimately mentions
 * `.katex-pending` selectors that must not read as pending content.
 */
export function detectPendingPlaceholders(html: string): PendingPlaceholder[] {
  const pending: PendingPlaceholder[] = []
  // Strip the leading <style> block the intermediate form carries; selectors
  // such as `.katex-pending` would otherwise match the regex scans below.
  const bodyHtml = html.replace(/^<style>[\s\S]*?<\/style>/, ``)

  const diagramRegex = /<div[^>]*class="([^"]*)"[^>]*data-md-diagram-state="loading"/g
  for (const match of bodyHtml.matchAll(diagramRegex)) {
    const className = match[1]
    if (className.includes(`mermaid-diagram`))
      pending.push({ kind: `mermaid diagram`, detail: className, wayForward: WAY_FORWARD_DIAGRAM })
    else if (className.includes(`infographic-diagram`))
      pending.push({ kind: `infographic`, detail: className, wayForward: WAY_FORWARD_DIAGRAM })
    else if (className.includes(`plantuml-diagram`))
      pending.push({ kind: `plantuml diagram`, detail: className, wayForward: WAY_FORWARD_DIAGRAM })
    else
      pending.push({ kind: `async diagram`, detail: className, wayForward: WAY_FORWARD_DIAGRAM })
  }

  if (/<[^>]*\bkatex-pending\b/.test(bodyHtml))
    pending.push({ kind: `KaTeX formula`, detail: `katex-pending`, wayForward: WAY_FORWARD_MATH })

  for (const match of bodyHtml.matchAll(/data-language-pending="([^"]*)"/g))
    pending.push({ kind: `unregistered code language`, detail: match[1], wayForward: WAY_FORWARD_LANGUAGE })

  return pending
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export interface WeChatRenderResult {
  html: string
  readingTime: {
    words: number
    minutes: number
  }
}

/**
 * Render Markdown to WeChat-ready HTML: inline styles everywhere, no class
 * attributes, no <style> block, WeChat post-processing applied.
 * Throws if the render produces pending placeholders (mermaid, KaTeX,
 * infographic, unregistered code languages) — they must never be silently
 * stripped.
 */
export function renderMarkdownToWeChatHtml(markdown: string, config: RenderConfigInput = {}): WeChatRenderResult {
  const styled = renderMarkdownToStyledHtml(markdown, config)

  const pending = detectPendingPlaceholders(styled.html)
  if (pending.length > 0) {
    const first = pending[0]
    throw new PendingPlaceholderError(pending, `pending ${first.kind} ("${first.detail}") cannot be rendered offline: ${first.wayForward}`)
  }

  const values: WeChatVariableValues = {
    primaryColor: config.primaryColor ?? siteDefaultRenderConfig.primaryColor,
    fontFamily: config.fontFamily ?? siteDefaultRenderConfig.fontFamily,
    fontSize: config.fontSize ?? siteDefaultRenderConfig.fontSize,
    lineHeight: config.lineHeight ?? siteDefaultRenderConfig.lineHeight,
    blockSpacing: config.blockSpacing ?? siteDefaultRenderConfig.blockSpacing,
  }

  let html = mergeCss(styled.html)
  html = hoistNestedLists(html)

  // Inline anchors are meaningless in WeChat articles.
  html = html.replace(/<a([^>]*)href="#[^"]*"([^>]*)>/gi, `<a$1$2>`)

  html = resolveCssLiterals(html, values)
  html = convertImageDimensionsToStyle(html)
  html = bracketWithZeroFontParagraphs(html)
  html = stripClassAttributes(html)

  return { html, readingTime: styled.readingTime }
}

/** Thrown when rendering leaves pending placeholders (mermaid, KaTeX, ...). */
export class PendingPlaceholderError extends Error {
  readonly placeholders: PendingPlaceholder[]

  constructor(placeholders: PendingPlaceholder[], message: string) {
    super(message)
    this.name = `PendingPlaceholderError`
    this.placeholders = placeholders
  }
}
