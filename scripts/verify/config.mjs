/**
 * Designer config support for the verify gate.
 *
 * The same projected configuration must reach both sides, or a config-driven
 * difference would masquerade as an implementation difference. Projection keeps
 * only render-affecting keys: article content and pure-UI state are dropped
 * before either side sees the config, so an exported config can never make the
 * gate compare an article instead of the fixture.
 *
 * The five style keys a Designer export cannot carry (lineHeight, blockSpacing,
 * linkColor, blockquoteBackground, headingStyles) are deliberately left out:
 * each side falls back to its own site defaults, and a unit test guards that
 * those defaults agree.
 */

const RENDER_KEYS = [
  `theme`,
  `primaryColor`,
  `fontFamily`,
  `fontSize`,
  `isUseIndent`,
  `isUseJustify`,
  `legend`,
  `isCiteStatus`,
  `isCountStatus`,
  `isMacCodeBlock`,
  `isShowLineNumber`,
  `codeBlockTheme`,
  `cssContentConfig`,
]

const CONTENT_KEYS = [`posts`, `currentPostId`, `currentPostIndex`, `titleList`, `readingTime`]

const UI_KEYS = [
  `isDark`,
  `isOpenRightSlider`,
  `isOpenPostSlider`,
  `showAIToolbox`,
  `isShowCssEditor`,
  `isShowTableEditDialog`,
  `isShowUploadImgDialog`,
  `aiDialogVisible`,
  `aiImageDialogVisible`,
]

const SUPPORTED_THEMES = [`default`, `grace`, `simple`]

/** Per-theme style keys the Designer export carries inside `themeSettings`. */
const PER_THEME_KEYS = [
  `primaryColor`,
  `fontFamily`,
  `fontSize`,
  `codeBlockTheme`,
  `isShowLineNumber`,
  `isMacCodeBlock`,
]

class ConfigError extends Error {}

/**
 * Project a parsed Designer export down to render-affecting keys.
 *
 * Unknown keys are dropped rather than forwarded: the browser's import path
 * would apply a key it knows and the CLI would ignore it, which is exactly how
 * one side would silently see a different configuration.
 */
export function projectDesignerConfig(raw) {
  if (typeof raw !== `object` || raw === null || Array.isArray(raw))
    throw new ConfigError(`config must be a JSON object`)

  const projected = {}
  const dropped = { content: [], ui: [], unknown: [] }
  for (const key of Object.keys(raw)) {
    if (RENDER_KEYS.includes(key))
      projected[key] = raw[key]
    else if (CONTENT_KEYS.includes(key))
      dropped.content.push(key)
    else if (UI_KEYS.includes(key))
      dropped.ui.push(key)
    else
      dropped.unknown.push(key)
  }

  if (typeof projected.theme === `string` && !SUPPORTED_THEMES.includes(projected.theme)) {
    throw new ConfigError(
      `theme "${projected.theme}" is not available to both sides `
      + `(supported: ${SUPPORTED_THEMES.join(`, `)}). A marketplace theme is not installed in the `
      + `browser and is not known to the CLI, so the two would silently default differently.`,
    )
  }

  return { projected, dropped }
}

function setEntry(entries, key, value, encoding) {
  entries.push({ key, value, encoding })
}

/**
 * Build the init script that seeds the projected config into the app's own
 * storage before boot.
 *
 * The app migrates every `localStorage` key into IndexedDB on first launch and
 * serves it synchronously to the Pinia stores, so one navigation with a seeded
 * localStorage is enough. Every write stays inside the temporary browser
 * profile; nothing touches the repository.
 */
export function buildConfigSeedScript(projected) {
  const entries = []
  if (typeof projected.theme === `string`)
    setEntry(entries, `MD__theme`, projected.theme, `raw`)

  const themeSettings = {}
  for (const key of PER_THEME_KEYS) {
    if (projected[key] !== undefined)
      themeSettings[key] = projected[key]
  }
  if (Object.keys(themeSettings).length > 0) {
    setEntry(entries, `MD__themeSettings`, {
      [projected.theme ?? `default`]: themeSettings,
    }, `json`)
  }

  if (projected.isCiteStatus !== undefined)
    setEntry(entries, `isCiteStatus`, projected.isCiteStatus, `json`)
  if (projected.isCountStatus !== undefined)
    setEntry(entries, `isCountStatus`, projected.isCountStatus, `json`)
  if (typeof projected.legend === `string`)
    setEntry(entries, `legend`, projected.legend, `raw`)
  if (projected.isUseIndent !== undefined)
    setEntry(entries, `MD__use_indent`, projected.isUseIndent, `json`)
  if (projected.isUseJustify !== undefined)
    setEntry(entries, `MD__use_justify`, projected.isUseJustify, `json`)
  if (projected.cssContentConfig !== undefined)
    setEntry(entries, `MD__css_content_config`, projected.cssContentConfig, `json`)

  const payload = JSON.stringify(entries)
  return `(() => {
  const entries = ${payload}
  try {
    for (const entry of entries)
      localStorage.setItem(entry.key, entry.encoding === 'json' ? JSON.stringify(entry.value) : String(entry.value))
  } catch {}
})()`
}

/**
 * Assert the seed actually took effect before the fixture is injected.
 *
 * An untrusted seed that silently no-ops would compare two site-default renders
 * and pass — the worst possible failure for a gate, so it is checked instead of
 * assumed.
 */
export async function assertConfigApplied(page, projected) {
  if (typeof projected.primaryColor === `string`) {
    const applied = await page.evaluate(() => {
      const theme = document.getElementById(`md-theme`)
      return theme ? theme.textContent : ``
    })
    if (!applied.includes(`--md-primary-color: ${projected.primaryColor}`)) {
      throw new ConfigError(
        `config did not reach the app: expected --md-primary-color: ${projected.primaryColor} in #md-theme, `
        + `found ${applied.includes(`--md-primary-color`) ? `a different value` : `no variable`}. `
        + `Refusing to compare two site-default renders.`,
      )
    }
  }

  if (typeof projected.codeBlockTheme === `string`) {
    const href = await page.evaluate(() => {
      const link = document.getElementById(`hljs`)
      return link ? link.getAttribute(`href`) : null
    })
    if (href !== projected.codeBlockTheme) {
      throw new ConfigError(
        `config did not reach the app: expected the #hljs stylesheet to be ${projected.codeBlockTheme}, got ${href}.`,
      )
    }
  }
}

export { ConfigError }
