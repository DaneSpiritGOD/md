/**
 * Config-file dialects for the md-web-cli `--config` option.
 *
 * Two dialects are accepted and both normalize to the internal
 * `RenderConfigInput`:
 *
 * - Designer config (first-class): what the web app's editor-state dialog
 *   exports (`apps/web/src/components/editor/dialogs/EditorStateDialog.vue`,
 *   `getAllStoreStates()`). Uses `isCiteStatus` / `isCountStatus` naming and
 *   carries the CSS editor state as `cssContentConfig`.
 * - MCP schema JSON (alias): the `render_markdown` input schema from
 *   `packages/mcp-server` (`citeStatus`, `headingStyles`, preset
 *   `codeBlockTheme` URLs, ...).
 *
 * Normalization is whitelist-based: unknown ("junk") keys are ignored
 * silently, never an error. The five style parameters the Designer export
 * does not carry (lineHeight, blockSpacing, linkColor, blockquoteBackground,
 * headingStyles) simply stay unset and fall back to site defaults.
 */
import type { HeadingLevel, HeadingStyles, HeadingStyleType } from '@md/shared/configs/style'
import type { LegendValue, RenderConfigInput } from './types'

export type ConfigDialect = 'designer' | 'mcp'

/** One CSS editor tab as persisted by the web app's cssEditor store. */
export interface DesignerCssTabInput {
  id?: unknown
  title?: unknown
  name?: unknown
  content?: unknown
  [key: string]: unknown
}

/** CSS editor state as exported by the Designer (`cssContentConfig`). */
export interface DesignerCssContentConfigInput {
  active?: unknown
  tabs?: unknown
  [key: string]: unknown
}

/** Arbitrary JSON object, e.g. a parsed `--config` file. */
export interface RawStyleConfig {
  [key: string]: unknown
}

/** CLI flag overrides that beat config-file values. */
export interface FlagOverrides {
  theme?: RenderConfigInput['theme']
  primaryColor?: string
  fontFamily?: string
  fontSize?: string
  lineHeight?: string
  blockSpacing?: string
  linkColor?: string
  blockquoteBackground?: string
  bodyColor?: string
  legend?: LegendValue
  codeBlockTheme?: string
  themeMode?: RenderConfigInput['themeMode']
  citeStatus?: boolean
  countStatus?: boolean
  isMacCodeBlock?: boolean
  isShowLineNumber?: boolean
  isUseIndent?: boolean
  isUseJustify?: boolean
  headingStyles?: HeadingStyles
}

const HEADING_LEVELS: HeadingLevel[] = [`h1`, `h2`, `h3`, `h4`, `h5`, `h6`]
const HEADING_STYLE_VALUES: HeadingStyleType[] = [`default`, `color-only`, `border-bottom`, `border-left`, `custom`]
const LEGEND_VALUES: LegendValue[] = [`title-alt`, `alt-title`, `title`, `alt`, `filename`, `none`]
const THEME_NAMES = [`default`, `grace`, `simple`] as const
const THEME_MODES = [`light`, `dark`] as const

const CODE_BLOCK_THEME_URL_PREFIX = `https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/npm/highlightjs/11.11.1/styles/`

function pickString(value: unknown): string | undefined {
  return typeof value === `string` && value.length > 0 ? value : undefined
}

function pickBoolean(value: unknown): boolean | undefined {
  return typeof value === `boolean` ? value : undefined
}

/** Accept both the MCP preset URLs and the friendly hljs theme names. */
function normalizeCodeBlockTheme(value: unknown): string | undefined {
  const raw = pickString(value)
  if (!raw)
    return undefined
  if (raw.startsWith(CODE_BLOCK_THEME_URL_PREFIX)) {
    return raw
      .slice(CODE_BLOCK_THEME_URL_PREFIX.length)
      .replace(/\.min\.css$/i, ``)
  }
  return raw
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === `string` && (allowed as readonly string[]).includes(value) ? value as T : undefined
}

function normalizeHeadingStyles(value: unknown): HeadingStyles | undefined {
  if (typeof value !== `object` || value === null)
    return undefined
  const source = value as Record<string, unknown>
  const result: HeadingStyles = {}
  let found = false
  for (const level of HEADING_LEVELS) {
    const style = pickEnum(source[level], HEADING_STYLE_VALUES)
    if (style && style !== `default`) {
      result[level] = style
      found = true
    }
  }
  return found ? result : undefined
}

/**
 * Resolve the CSS editor state to the active tab's CSS.
 *
 * Mirrors the site: only the active tab's content is applied, other tabs are
 * ignored. `active` holds a tab id (legacy data may hold a name).
 * `cssTab` (--css-tab) overrides the selection by id or name.
 */
export function resolveCustomCss(
  cssContentConfig: DesignerCssContentConfigInput | undefined,
  cssTab?: string,
): string | undefined {
  if (!cssContentConfig || typeof cssContentConfig !== `object`)
    return undefined
  const tabs = Array.isArray(cssContentConfig.tabs) ? cssContentConfig.tabs as DesignerCssTabInput[] : []
  const usable = tabs.filter(tab => typeof tab === `object` && tab !== null)
  if (usable.length === 0)
    return undefined

  let tab: DesignerCssTabInput | undefined
  if (cssTab) {
    tab = usable.find(t => t.id === cssTab)
      ?? usable.find(t => pickString(t.name) === cssTab)
      ?? usable.find(t => pickString(t.title) === cssTab)
    if (tab === undefined) {
      const names = usable.map(t => pickString(t.name) ?? pickString(t.title) ?? pickString(t.id) ?? `(unnamed)`)
      throw new Error(`--css-tab "${cssTab}" does not match any CSS editor tab (id or name). Known tabs: ${names.join(', ')}`)
    }
  }
  else {
    const active = pickString(cssContentConfig.active)
    tab = (active ? (usable.find(t => t.id === active) ?? usable.find(t => pickString(t.name) === active)) : undefined)
      ?? usable[0]
  }

  const content = pickString(tab.content)
  return content?.trim() ? content : undefined
}

/** Normalize the Designer export dialect (`isCiteStatus`, `cssContentConfig`, ...). */
export function normalizeDesignerConfig(raw: RawStyleConfig, options: { cssTab?: string } = {}): RenderConfigInput {
  const config: RenderConfigInput = {}
  const theme = pickEnum(raw.theme, THEME_NAMES)
  if (theme)
    config.theme = theme
  const fontFamily = pickString(raw.fontFamily)
  if (fontFamily)
    config.fontFamily = fontFamily
  const fontSize = pickString(raw.fontSize)
  if (fontSize)
    config.fontSize = fontSize
  const primaryColor = pickString(raw.primaryColor)
  if (primaryColor)
    config.primaryColor = primaryColor
  const codeBlockTheme = normalizeCodeBlockTheme(raw.codeBlockTheme)
  if (codeBlockTheme)
    config.codeBlockTheme = codeBlockTheme
  const legend = pickEnum(raw.legend, LEGEND_VALUES)
  if (legend)
    config.legend = legend
  const isMacCodeBlock = pickBoolean(raw.isMacCodeBlock)
  if (isMacCodeBlock !== undefined)
    config.isMacCodeBlock = isMacCodeBlock
  const isShowLineNumber = pickBoolean(raw.isShowLineNumber)
  if (isShowLineNumber !== undefined)
    config.isShowLineNumber = isShowLineNumber
  // Designer naming -> internal Renderer option naming.
  const citeStatus = pickBoolean(raw.isCiteStatus)
  if (citeStatus !== undefined)
    config.citeStatus = citeStatus
  const countStatus = pickBoolean(raw.isCountStatus)
  if (countStatus !== undefined)
    config.countStatus = countStatus
  const isUseIndent = pickBoolean(raw.isUseIndent)
  if (isUseIndent !== undefined)
    config.isUseIndent = isUseIndent
  const isUseJustify = pickBoolean(raw.isUseJustify)
  if (isUseJustify !== undefined)
    config.isUseJustify = isUseJustify

  const cssContentConfig = raw.cssContentConfig as DesignerCssContentConfigInput | undefined
  const customCss = resolveCustomCss(
    typeof cssContentConfig === `object` && cssContentConfig !== null ? cssContentConfig : undefined,
    options.cssTab,
  )
  if (customCss)
    config.customCss = customCss

  return config
}

/** Normalize the MCP schema dialect (`citeStatus`, `headingStyles`, ...). */
export function normalizeMcpConfig(raw: RawStyleConfig): RenderConfigInput {
  const config: RenderConfigInput = {}
  const theme = pickEnum(raw.theme, THEME_NAMES)
  if (theme)
    config.theme = theme
  const fontFamily = pickString(raw.fontFamily)
  if (fontFamily)
    config.fontFamily = fontFamily
  const fontSize = pickString(raw.fontSize)
  if (fontSize)
    config.fontSize = fontSize
  const primaryColor = pickString(raw.primaryColor)
  if (primaryColor)
    config.primaryColor = primaryColor
  const lineHeight = pickString(raw.lineHeight)
  if (lineHeight)
    config.lineHeight = lineHeight
  const blockSpacing = pickString(raw.blockSpacing)
  if (blockSpacing)
    config.blockSpacing = blockSpacing
  const linkColor = pickString(raw.linkColor)
  if (linkColor)
    config.linkColor = linkColor
  const blockquoteBackground = pickString(raw.blockquoteBackground)
  if (blockquoteBackground)
    config.blockquoteBackground = blockquoteBackground
  const codeBlockTheme = normalizeCodeBlockTheme(raw.codeBlockTheme)
  if (codeBlockTheme)
    config.codeBlockTheme = codeBlockTheme
  const legend = pickEnum(raw.legend, LEGEND_VALUES)
  if (legend)
    config.legend = legend
  const themeMode = pickEnum(raw.themeMode, THEME_MODES)
  if (themeMode)
    config.themeMode = themeMode
  const isMacCodeBlock = pickBoolean(raw.isMacCodeBlock)
  if (isMacCodeBlock !== undefined)
    config.isMacCodeBlock = isMacCodeBlock
  const isShowLineNumber = pickBoolean(raw.isShowLineNumber)
  if (isShowLineNumber !== undefined)
    config.isShowLineNumber = isShowLineNumber
  const citeStatus = pickBoolean(raw.citeStatus)
  if (citeStatus !== undefined)
    config.citeStatus = citeStatus
  const countStatus = pickBoolean(raw.countStatus)
  if (countStatus !== undefined)
    config.countStatus = countStatus
  const isUseIndent = pickBoolean(raw.isUseIndent)
  if (isUseIndent !== undefined)
    config.isUseIndent = isUseIndent
  const isUseJustify = pickBoolean(raw.isUseJustify)
  if (isUseJustify !== undefined)
    config.isUseJustify = isUseJustify
  const headingStyles = normalizeHeadingStyles(raw.headingStyles)
  if (headingStyles)
    config.headingStyles = headingStyles
  return config
}

/**
 * Detect the dialect of a raw config object. The Designer export is
 * recognized by its `is*` naming or the CSS editor state; anything else is
 * treated as the MCP alias.
 */
export function detectConfigDialect(raw: RawStyleConfig): ConfigDialect {
  if (`cssContentConfig` in raw || `isCiteStatus` in raw || `isCountStatus` in raw)
    return `designer`
  return `mcp`
}

/** Normalize either dialect to the internal render config. */
export function normalizeStyleConfig(
  raw: RawStyleConfig,
  options: { dialect?: ConfigDialect, cssTab?: string } = {},
): RenderConfigInput {
  const dialect = options.dialect ?? detectConfigDialect(raw)
  return dialect === `designer`
    ? normalizeDesignerConfig(raw, options)
    : normalizeMcpConfig(raw)
}

/**
 * Apply CLI flag overrides on top of a normalized config.
 * Precedence: built-in defaults < config file < CLI flags.
 */
export function applyFlagOverrides(config: RenderConfigInput, flags: FlagOverrides): RenderConfigInput {
  const merged: RenderConfigInput = { ...config }
  for (const [key, value] of Object.entries(flags)) {
    if (value !== undefined)
      (merged as Record<string, unknown>)[key] = value
  }
  return merged
}
