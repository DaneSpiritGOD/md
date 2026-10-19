import atomOneDarkCSS from '../vendor/hljs-styles/atom-one-dark.min.css?raw'
import atomOneLightCSS from '../vendor/hljs-styles/atom-one-light.min.css?raw'
import githubDarkCSS from '../vendor/hljs-styles/github-dark.min.css?raw'
import githubCSS from '../vendor/hljs-styles/github.min.css?raw'
import monokaiCSS from '../vendor/hljs-styles/monokai.min.css?raw'
import nordCSS from '../vendor/hljs-styles/nord.min.css?raw'
import tokyoNightDarkCSS from '../vendor/hljs-styles/tokyo-night-dark.min.css?raw'
import tokyoNightLightCSS from '../vendor/hljs-styles/tokyo-night-light.min.css?raw'
import vsCSS from '../vendor/hljs-styles/vs.min.css?raw'
import xcodeCSS from '../vendor/hljs-styles/xcode.min.css?raw'
/**
 * Theme + syntax-highlighting stylesheet assets, imported as text at bundle
 * time via esbuild's `.css -> text` loader (mirrors Vite's `?raw` imports
 * used by @md/shared). Nothing is fetched at runtime: the CLI is zero-network.
 */
import baseCSS from './assets/base.css?raw'
import defaultCSS from './assets/default.css?raw'
import graceCSS from './assets/grace.css?raw'
import simpleCSS from './assets/simple.css?raw'

export const baseCSSContent = baseCSS

export const themeMap = {
  default: defaultCSS,
  grace: graceCSS,
  simple: simpleCSS,
} as const

export type ThemeName = keyof typeof themeMap

/**
 * Friendly name -> vendored highlight.js preset stylesheet contents.
 * Copies of the CDN files the web app references; bundled locally so
 * rendering makes zero network requests.
 */
export const codeBlockThemeMap: Record<string, string> = {
  'github': githubCSS,
  'github-dark': githubDarkCSS,
  'atom-one-light': atomOneLightCSS,
  'atom-one-dark': atomOneDarkCSS,
  'monokai': monokaiCSS,
  'vs': vsCSS,
  'xcode': xcodeCSS,
  'nord': nordCSS,
  'tokyo-night-light': tokyoNightLightCSS,
  'tokyo-night-dark': tokyoNightDarkCSS,
}

export const codeBlockThemeNames = Object.keys(codeBlockThemeMap)

export function isKnownCodeBlockTheme(name: string): boolean {
  return Object.hasOwn(codeBlockThemeMap, name)
}
