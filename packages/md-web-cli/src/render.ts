/**
 * Render pipeline entry for md-web-cli.
 *
 * Mirrors the MCP server's pipeline (marked + custom renderer + HTML
 * post-processing + merged CSS in a <style> block) but bundles every asset
 * locally: theme CSS is inlined at build time and code themes come from
 * vendored files — zero network requests.
 *
 * Output is an intermediate form carrying a <style> block; CSS inlining into
 * style attributes (juice + WeChat post-processing) is ticket 04's job.
 */
import type { HeadingStyles } from '@md/shared/configs/style'
import type { RenderConfigInput } from './types'
import { initRenderer } from '@md/core/renderer'
import { generateCSSVariables, generateHeadingStyles, processCSS } from '@md/core/theme'
import { postProcessHtml, renderMarkdown } from '@md/core/utils'
import { baseCSSContent, codeBlockThemeMap, isKnownCodeBlockTheme, themeMap } from './assets'
import { siteDefaultRenderConfig } from './defaults'

function escapeStyleContent(css: string): string {
  return css.replace(/<\/style/gi, `<\\/style`)
}

function resolveHeadingStyles(config: RenderConfigInput): HeadingStyles | undefined {
  return config.headingStyles
}

/**
 * Strip the site's `#output` scope from a stylesheet so its selectors match the
 * rendered fragment, exactly as apps/web does before juice
 * (share-styles.ts stripOutputScope). A bare `#output {` becomes `body {`; a
 * descendant `#output x` becomes `x`. This is what makes rules like
 * `#output section > :first-child { margin-top: 0 !important }` apply to the
 * fragment's own first children.
 */
function stripOutputScope(css: string): string {
  return css
    .replace(/#output\s*\{/g, `body {`)
    .replace(/#output\s+/g, ``)
    .replace(/^#output\s*/gm, ``)
}

/**
 * Unscope the site's `#output`-scoped custom CSS so it matches the rendered
 * fragment (apps/web stripOutputScope, before juice). `#output x` -> `x`;
 * a bare `#output {` rule becomes the container rule.
 */
function unscopeCustomCSS(css: string): string {
  return css
    .replace(/#output\s*\{/g, `section.container {`)
    .replace(/#output\s+/g, ``)
    .replace(/^#output\s*/gm, ``)
}

/**
 * Inject heading anchor ids (`#0`, `#1`, …) mirroring the site's render store
 * (extractTitles, apps/web/src/stores/render.ts). Pure string work so it
 * matches the browser output byte for byte without a DOM parse.
 */
function injectHeadingIds(html: string): string {
  let i = 0
  return html.replace(/data-heading="true"/g, () => `data-heading="true" id="${i++}"`)
}

export interface RenderResult {
  html: string
  readingTime: {
    words: number
    minutes: number
  }
}

export function renderMarkdownToStyledHtml(markdown: string, config: RenderConfigInput = {}): RenderResult {
  const theme = config.theme ?? siteDefaultRenderConfig.theme
  const primaryColor = config.primaryColor ?? siteDefaultRenderConfig.primaryColor
  const fontFamily = config.fontFamily ?? siteDefaultRenderConfig.fontFamily
  const fontSize = config.fontSize ?? siteDefaultRenderConfig.fontSize
  const lineHeight = config.lineHeight ?? siteDefaultRenderConfig.lineHeight
  const blockSpacing = config.blockSpacing ?? siteDefaultRenderConfig.blockSpacing
  const linkColor = config.linkColor ?? siteDefaultRenderConfig.linkColor
  const blockquoteBackground = config.blockquoteBackground ?? siteDefaultRenderConfig.blockquoteBackground
  const legend = config.legend ?? siteDefaultRenderConfig.legend
  const codeBlockTheme = config.codeBlockTheme ?? siteDefaultRenderConfig.codeBlockTheme

  if (!isKnownCodeBlockTheme(codeBlockTheme)) {
    throw new Error(
      `Unknown code block theme "${codeBlockTheme}". Known themes: ${Object.keys(codeBlockThemeMap).join(', ')}`,
    )
  }

  const renderer = initRenderer({
    isMacCodeBlock: config.isMacCodeBlock ?? siteDefaultRenderConfig.isMacCodeBlock,
    isShowLineNumber: config.isShowLineNumber ?? siteDefaultRenderConfig.isShowLineNumber,
    citeStatus: config.citeStatus ?? siteDefaultRenderConfig.citeStatus,
    countStatus: config.countStatus ?? siteDefaultRenderConfig.countStatus,
    themeMode: config.themeMode ?? siteDefaultRenderConfig.themeMode,
    legend,
  })

  const { html: baseHtml, readingTime } = renderMarkdown(markdown, renderer)
  const processedHtml = injectHeadingIds(postProcessHtml(baseHtml, readingTime, renderer))

  const cssConfig = {
    primaryColor,
    fontFamily,
    fontSize,
    lineHeight,
    blockSpacing,
    linkColor,
    blockquoteBackground,
    isUseIndent: config.isUseIndent ?? siteDefaultRenderConfig.isUseIndent,
    isUseJustify: config.isUseJustify ?? siteDefaultRenderConfig.isUseJustify,
    headingStyles: resolveHeadingStyles(config),
  }

  const variablesCSS = generateCSSVariables(cssConfig)
  const headingStylesCSS = generateHeadingStyles(cssConfig)
  const themeCSS = themeMap[theme as keyof typeof themeMap]
  const hljsCSS = codeBlockThemeMap[codeBlockTheme]

  // Order mirrors the site's applyTheme: variables, base, theme, heading
  // styles, then the active CSS editor tab's custom CSS (site scopes custom
  // CSS to #output; the intermediate form already targets #output). Base CSS
  // is #output-scoped on the site, so strip that scope here (as the copy flow
  // does before juice) for selectors such as `section > :first-child`.
  const customCSS = config.customCss?.trim() ? unscopeCustomCSS(config.customCss) : ``

  const mergedCSS = [
    variablesCSS,
    stripOutputScope(baseCSSContent),
    themeCSS,
    headingStylesCSS,
    hljsCSS,
    customCSS,
  ].filter(Boolean).join(`\n\n`)

  const html = `<style>\n${escapeStyleContent(processCSS(mergedCSS))}\n</style>\n${processedHtml}`

  return {
    html,
    readingTime: {
      words: readingTime.words,
      minutes: readingTime.minutes,
    },
  }
}
