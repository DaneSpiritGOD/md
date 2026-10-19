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
  // Custom per-heading styles arrive with ticket 05's --config; for now the
  // site default (empty map = theme's built-in heading styles) applies.
  void config
  return undefined
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

  const mergedCSS = [
    variablesCSS,
    baseCSSContent,
    themeCSS,
    headingStylesCSS,
    hljsCSS,
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
