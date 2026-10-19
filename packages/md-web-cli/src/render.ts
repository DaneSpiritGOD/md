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

/** Default body text color (site copy flow inherits rgb(10,10,10) from body). */
export const DEFAULT_BODY_COLOR = `rgb(10,10,10)`

function resolveHeadingStyles(config: RenderConfigInput): HeadingStyles | undefined {
  return config.headingStyles
}

/**
 * Body text color applied the way the copy flow does: a rule on the output
 * container that every element inherits. Default rgb(10,10,10). The rendered
 * fragment's root element is `<section class="container">`, so target that —
 * juice inlines it onto the container in WeChat output.
 */
function generateBodyColorCSS(bodyColor: string): string {
  return `section.container {\n  color: ${bodyColor};\n}`
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
  const processedHtml = postProcessHtml(baseHtml, readingTime, renderer)

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
  // CSS to #output; the intermediate form already targets #output).
  const customCSS = config.customCss?.trim() ? unscopeCustomCSS(config.customCss) : ``
  const bodyColorCSS = generateBodyColorCSS(config.bodyColor ?? DEFAULT_BODY_COLOR)

  const mergedCSS = [
    variablesCSS,
    baseCSSContent,
    themeCSS,
    headingStylesCSS,
    hljsCSS,
    customCSS,
    bodyColorCSS,
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
