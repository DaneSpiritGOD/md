/** Shared types for the md-web-cli render pipeline. */

import type { HeadingStyles } from '@md/shared/configs/style'

/** Figure legend display mode, mirroring @md/shared legendOptions values. */
export type LegendValue = 'title-alt' | 'alt-title' | 'title' | 'alt' | 'filename' | 'none'

/** Options accepted by the render pipeline; all fall back to site defaults. */
export interface RenderConfigInput {
  theme?: 'default' | 'grace' | 'simple'
  primaryColor?: string
  fontFamily?: string
  fontSize?: string
  lineHeight?: string
  blockSpacing?: string
  linkColor?: string
  blockquoteBackground?: string
  legend?: LegendValue
  codeBlockTheme?: string
  isMacCodeBlock?: boolean
  isShowLineNumber?: boolean
  citeStatus?: boolean
  countStatus?: boolean
  themeMode?: 'light' | 'dark'
  isUseIndent?: boolean
  isUseJustify?: boolean
  /** Per-level heading style presets (MCP dialect key: headingStyles). */
  headingStyles?: HeadingStyles
  /** Active CSS editor tab's custom CSS (Designer dialect), merged after theme CSS. */
  customCss?: string
  /** Body text color, default rgb(10,10,10); applied the way the copy flow does. */
  bodyColor?: string
}
