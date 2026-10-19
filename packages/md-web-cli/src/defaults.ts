/**
 * Site-default style configuration for the md-web-cli render pipeline.
 *
 * Mirrors `defaultStyleConfig` in @md/shared/configs/style (the web app's
 * defaults), NOT the MCP server's `defaultRenderOptions`. Key differences:
 * the site shows the mac code-block title bar and highlights with the
 * `github-dark` theme; the MCP defaults use a light theme and no mac bar.
 */
import type { LegendValue } from './types'

/** Site default font stack (sans-serif) as used by the web app. */
export const DEFAULT_FONT_FAMILY
  = '-apple-system-font,BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB , Microsoft YaHei UI , Microsoft YaHei ,Arial,sans-serif'

export const siteDefaultRenderConfig = {
  theme: 'default',
  primaryColor: '#0F4C81',
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: '16px',
  lineHeight: '1.75',
  blockSpacing: '1',
  linkColor: '#576b95',
  blockquoteBackground: 'default',
  legend: 'alt' as LegendValue,
  codeBlockTheme: 'github-dark',
  isMacCodeBlock: true,
  isShowLineNumber: false,
  citeStatus: false,
  countStatus: false,
  themeMode: 'light' as const,
  isUseIndent: false,
  isUseJustify: false,
}

export type SiteDefaultRenderConfig = typeof siteDefaultRenderConfig
