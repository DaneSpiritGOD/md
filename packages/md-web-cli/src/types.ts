/** Shared types for the md-web-cli render pipeline. */

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
}
