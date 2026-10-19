import { describe, expect, it } from 'vitest'
import {
  applyFlagOverrides,
  detectConfigDialect,
  normalizeDesignerConfig,
  normalizeMcpConfig,
  normalizeStyleConfig,
  resolveCustomCss,
} from '../src/config'
import { renderMarkdownToStyledHtml } from '../src/render'
import { renderMarkdownToWeChatHtml } from '../src/wechat'

const designerExport = {
  isDark: false,
  isOpenRightSlider: true,
  // UI toggles / article content — junk keys that must be ignored silently.
  posts: [{ id: `p1`, content: `# junk` }],
  titleList: [],
  readingTime: { words: 999, minutes: 5 },
  isShowCssEditor: true,
  theme: `grace`,
  fontFamily: `Menlo, Monaco, 'Courier New', monospace`,
  fontSize: `17px`,
  primaryColor: `#FA5151`,
  codeBlockTheme: `https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/npm/highlightjs/11.11.1/styles/monokai.min.css`,
  legend: `title-alt`,
  isMacCodeBlock: false,
  isShowLineNumber: true,
  isCiteStatus: true,
  isCountStatus: true,
  isUseIndent: true,
  isUseJustify: true,
  cssContentConfig: {
    active: `tab-2`,
    tabs: [
      { id: `tab-1`, title: `First`, name: `First`, content: `h1 { color: red; }` },
      { id: `tab-2`, title: `Second`, name: `Second`, content: `h2 { color: blue; }` },
    ],
  },
}

describe('normalizeDesignerConfig', () => {
  it('maps the twelve styling keys of a Designer export, key by key', () => {
    const config = normalizeDesignerConfig(designerExport)
    // 1. theme
    expect(config.theme).toBe(`grace`)
    // 2. primaryColor
    expect(config.primaryColor).toBe(`#FA5151`)
    // 3. fontFamily
    expect(config.fontFamily).toBe(`Menlo, Monaco, 'Courier New', monospace`)
    // 4. fontSize
    expect(config.fontSize).toBe(`17px`)
    // 5. codeBlockTheme (MCP preset URL -> friendly hljs name)
    expect(config.codeBlockTheme).toBe(`monokai`)
    // 6. legend
    expect(config.legend).toBe(`title-alt`)
    // 7. isMacCodeBlock
    expect(config.isMacCodeBlock).toBe(false)
    // 8. isShowLineNumber
    expect(config.isShowLineNumber).toBe(true)
    // 9. isCiteStatus -> citeStatus
    expect(config.citeStatus).toBe(true)
    // 10. isCountStatus -> countStatus
    expect(config.countStatus).toBe(true)
    // 11. isUseIndent
    expect(config.isUseIndent).toBe(true)
    // 12. isUseJustify
    expect(config.isUseJustify).toBe(true)
    // Plus the CSS editor state -> active tab CSS.
    expect(config.customCss).toBe(`h2 { color: blue; }`)
  })

  it('ignores junk keys and article content silently', () => {
    const config = normalizeDesignerConfig({
      ...designerExport,
      posts: [{ id: 'x', content: '# huge article' }],
      someUnknownFutureKey: { nested: true },
      isOpenRightSlider: false,
    })
    expect(config).not.toHaveProperty('posts')
    expect(config).not.toHaveProperty('someUnknownFutureKey')
    expect(config).not.toHaveProperty('isOpenRightSlider')
    expect(config.theme).toBe(`grace`)
  })

  it('leaves the five keys absent from Designer exports unset (site defaults apply)', () => {
    const config = normalizeDesignerConfig(designerExport)
    expect(config.lineHeight).toBeUndefined()
    expect(config.blockSpacing).toBeUndefined()
    expect(config.linkColor).toBeUndefined()
    expect(config.blockquoteBackground).toBeUndefined()
    expect(config.headingStyles).toBeUndefined()
  })
})

describe('multi-tab CSS editor config', () => {
  it('applies only the active tab\'s CSS; other tabs do not interfere', () => {
    const raw = {
      isCiteStatus: false,
      cssContentConfig: designerExport.cssContentConfig,
    }
    const styled = renderMarkdownToStyledHtml(`# Hello`, normalizeDesignerConfig(raw))
    expect(styled.html).toContain(`h2 { color: blue; }`)
    expect(styled.html).not.toContain(`color:red`)
    expect(styled.html).not.toContain(`color: red`)
  })

  it('--css-tab overrides the selection by id or name', () => {
    const styledById = renderMarkdownToStyledHtml(
      `# Hello`,
      normalizeDesignerConfig(designerExport, { cssTab: `tab-1` }),
    )
    expect(styledById.html).toContain(`h1 { color: red; }`)
    expect(styledById.html).not.toContain(`color: blue`)

    const styledByName = renderMarkdownToStyledHtml(
      `# Hello`,
      normalizeStyleConfig(designerExport, { dialect: `designer`, cssTab: `Second` }),
    )
    expect(styledByName.html).toContain(`h2 { color: blue; }`)

    expect(() => normalizeDesignerConfig(designerExport, { cssTab: `nope` }))
      .toThrowError(/does not match any CSS editor tab/)
  })

  it('falls back to the first tab when no active marker matches', () => {
    const css = resolveCustomCss({ active: `missing`, tabs: designerExport.cssContentConfig.tabs })
    expect(css).toBe(`h1 { color: red; }`)
  })
})

describe('dialect equivalence', () => {
  const designerDialect = normalizeDesignerConfig({
    theme: `simple`,
    primaryColor: `#009874`,
    fontFamily: `Optima-Regular, Optima, PingFangSC-light, serif`,
    fontSize: `15px`,
    legend: `none`,
    isMacCodeBlock: true,
    isShowLineNumber: true,
    isCiteStatus: true,
    isCountStatus: true,
    isUseIndent: false,
    isUseJustify: false,
    codeBlockTheme: `https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/npm/highlightjs/11.11.1/styles/github.min.css`,
  })

  const mcpDialect = normalizeMcpConfig({
    theme: `simple`,
    primaryColor: `#009874`,
    fontFamily: `Optima-Regular, Optima, PingFangSC-light, serif`,
    fontSize: `15px`,
    legend: `none`,
    isMacCodeBlock: true,
    isShowLineNumber: true,
    citeStatus: true,
    countStatus: true,
    isUseIndent: false,
    isUseJustify: false,
    codeBlockTheme: `https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/npm/highlightjs/11.11.1/styles/github.min.css`,
  })

  it('normalizes both dialects to the same internal config', () => {
    expect(mcpDialect).toEqual(designerDialect)
  })

  it('produces equivalent HTML from the same source', () => {
    const markdown = `# Title\n\nText with [a link](https://example.com).\n\n\`\`\`js\nconsole.log(1)\n\`\`\`\n`
    expect(renderMarkdownToStyledHtml(markdown, mcpDialect).html)
      .toBe(renderMarkdownToStyledHtml(markdown, designerDialect).html)
    expect(renderMarkdownToWeChatHtml(markdown, mcpDialect).html)
      .toBe(renderMarkdownToWeChatHtml(markdown, designerDialect).html)
  })

  it('detects the dialect from the config shape', () => {
    expect(detectConfigDialect({ isCiteStatus: true })).toBe(`designer`)
    expect(detectConfigDialect({ cssContentConfig: { active: '', tabs: [] } })).toBe(`designer`)
    expect(detectConfigDialect({ citeStatus: true })).toBe(`mcp`)
    expect(detectConfigDialect({ theme: `grace` })).toBe(`mcp`)
  })
})

describe('flag overrides beat config values', () => {
  it('applyFlagOverrides only sets explicitly provided flags', () => {
    const config = applyFlagOverrides(
      normalizeMcpConfig({ primaryColor: `#009874`, theme: `grace` }),
      { primaryColor: `#556B2F` },
    )
    expect(config.primaryColor).toBe(`#556B2F`)
    expect(config.theme).toBe(`grace`)
  })

  it('--body-color changes the body text color over config and default', () => {
    const markdown = `# Title\n\nParagraph.\n`
    const defaultRender = renderMarkdownToWeChatHtml(markdown)
    expect(defaultRender.html).toContain(`rgb(10,10,10)`)

    const config = normalizeMcpConfig({ primaryColor: `#009874` })
    const overridden = renderMarkdownToWeChatHtml(markdown, applyFlagOverrides(config, { bodyColor: `#123456` }))
    expect(overridden.html).toContain(`color: #123456`)
    expect(overridden.html).not.toContain(`rgb(10,10,10)`)

    const styled = renderMarkdownToStyledHtml(markdown, applyFlagOverrides(config, { bodyColor: `#ABCDEF` }))
    expect(styled.html).toContain(`color: #ABCDEF`)
  })
})

describe('--raw intermediate output', () => {
  const markdown = `# Title\n\nParagraph.\n`

  it('emits the pre-inlining form with a <style> block', () => {
    const raw = renderMarkdownToStyledHtml(markdown, {})
    expect(raw.html.startsWith(`<style>`)).toBe(true)
    expect(raw.html).toContain(`</style>`)
  })

  it('differs from the WeChat output of the same source', () => {
    const raw = renderMarkdownToStyledHtml(markdown, {})
    const wechat = renderMarkdownToWeChatHtml(markdown, {})
    expect(raw.html).not.toBe(wechat.html)
    expect(wechat.html.startsWith(`<style>`)).toBe(false)
  })

  it('keeps ticket 04 failure semantics: pending placeholders fail in both modes', () => {
    const mermaidMarkdown = '```mermaid\ngraph TD\nA-->B\n```\n'
    expect(() => renderMarkdownToWeChatHtml(mermaidMarkdown, {})).toThrowError(/cannot be rendered offline/)
    const raw = renderMarkdownToStyledHtml(mermaidMarkdown, {})
    expect(raw.html).toContain(`data-md-diagram-state="loading"`)
  })
})
