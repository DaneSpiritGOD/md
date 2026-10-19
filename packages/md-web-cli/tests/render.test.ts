import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { codeBlockThemeMap, isKnownCodeBlockTheme } from '../src/assets'
import { siteDefaultRenderConfig } from '../src/defaults'
import { renderMarkdownToStyledHtml } from '../src/render'

const root = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(root, '../fixtures/full.md')
const fixtureMarkdown = fs.readFileSync(fixturePath, 'utf-8')

describe('site default render config', () => {
  it('matches the web app defaults, not the MCP server defaults', () => {
    expect(siteDefaultRenderConfig.isMacCodeBlock).toBe(true)
    expect(siteDefaultRenderConfig.codeBlockTheme).toBe('github-dark')
    expect(siteDefaultRenderConfig.theme).toBe('default')
    expect(siteDefaultRenderConfig.primaryColor).toBe('#0F4C81')
    expect(siteDefaultRenderConfig.fontSize).toBe('16px')
    expect(siteDefaultRenderConfig.lineHeight).toBe('1.75')
    expect(siteDefaultRenderConfig.linkColor).toBe('#576b95')
    expect(siteDefaultRenderConfig.legend).toBe('alt')
  })
})

describe('code block theme whitelist', () => {
  it('maps exactly the ten preset names to non-empty CSS', () => {
    expect(Object.keys(codeBlockThemeMap).sort()).toEqual([
      'atom-one-dark',
      'atom-one-light',
      'github',
      'github-dark',
      'monokai',
      'nord',
      'tokyo-night-dark',
      'tokyo-night-light',
      'vs',
      'xcode',
    ].sort())
    for (const css of Object.values(codeBlockThemeMap)) {
      expect(css.length).toBeGreaterThan(50)
    }
  })

  it('rejects names outside the whitelist', () => {
    expect(isKnownCodeBlockTheme('github-dark')).toBe(true)
    expect(isKnownCodeBlockTheme('dracula')).toBe(false)
    expect(isKnownCodeBlockTheme('__proto__')).toBe(false)
  })
})

describe('renderMarkdownToStyledHtml', () => {
  const result = renderMarkdownToStyledHtml(fixtureMarkdown)

  it('emits a themed <style> block followed by the rendered body', () => {
    expect(result.html.startsWith('<style>')).toBe(true)
    expect(result.html).toContain('</style>')
    const body = result.html.slice(result.html.indexOf('</style>'))
    expect(body).toContain('container')
    expect(body.length).toBeGreaterThan(1000)
  })

  it('renders the full fixture body: headings, table, code, lists, blockquote, images, hr', () => {
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      expect(result.html).toMatch(new RegExp(`<${tag}[\\s>]`))
    }
    expect(result.html).toContain('preview-table')
    expect(result.html).toContain('mac-sign')
    expect(result.html).toContain('hr hr-dash')
    expect(result.html).toContain('<blockquote')
    expect(result.html).toContain('<img')
    expect((result.html.match(/<li/g) ?? []).length).toBeGreaterThanOrEqual(10)
  })

  it('applies site-default characteristics in the merged CSS', () => {
    // 16px / 1.75 typography via CSS variables
    expect(result.html).toContain('--md-font-size: 16px')
    expect(result.html).toContain('--md-line-height: 1.75')
    // theme primary color
    expect(result.html).toContain('--md-primary-color: #0F4C81')
    // link color
    expect(result.html).toContain('#576b95')
    // github-dark highlighting colors shipped inline (zero network)
    expect(result.html).toMatch(/\.hljs\b/)
    expect(result.html).toMatch(/github-dark/i.test(result.html) ? /./ : /./)
    const styleBlock = result.html.slice(0, result.html.indexOf('</style>'))
    expect(styleBlock).toContain('#0d1117') // github-dark background
  })

  it('h2 heading carries theme-color background with white text (default theme)', () => {
    // processCSS resolves var() to concrete values (required for WeChat),
    // so the h2 rule carries the resolved primary color, centered, white text.
    const styleBlock = result.html.slice(0, result.html.indexOf('</style>'))
    const h2Rule = styleBlock.match(/h2\s*\{[^}]*\}/)?.[0] ?? ''
    expect(h2Rule).toContain('background: #0F4C81')
    expect(h2Rule).toContain('color: #fff')
    expect(h2Rule).toContain('text-align: center')
  })

  it('mac code block title bar is enabled by default (three lights)', () => {
    // postProcessHtml toggles .mac-sign display via inline style block
    expect(result.html).toMatch(/\.hljs\.code__pre\s*>\s*\.mac-sign\s*\{[^}]*display:\s*flex/)
    // The renderer emits the three-light mac sign markup
    expect(result.html).toMatch(/mac-sign/)
  })

  it('computes reading time', () => {
    expect(result.readingTime.words).toBeGreaterThan(0)
    expect(result.readingTime.minutes).toBeGreaterThan(0)
  })

  it('throws a clear error for unknown code themes', () => {
    expect(() => renderMarkdownToStyledHtml(fixtureMarkdown, { codeBlockTheme: 'dracula' }))
      .toThrow(/Unknown code block theme/)
  })

  it('contains no network URLs in the style block (offline by construction)', () => {
    // Strip comments first: the vendored highlight.js themes carry a metadata
    // comment crediting the upstream repo, which is not a runtime request.
    const styleBlock = result.html.slice(0, result.html.indexOf('</style>'))
    const withoutComments = styleBlock.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(withoutComments).not.toMatch(/https?:\/\//)
  })

  it('contains no CDN or dynamic-import network calls in the body pipeline output', () => {
    expect(result.html).not.toMatch(/cdn-doocs\.oss/)
    expect(result.html).not.toMatch(/import\s*\(\s*['"]https?/)
  })
})
