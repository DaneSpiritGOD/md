/**
 * Ticket 04: WeChat-ready output + pending-placeholder failure semantics.
 *
 * Library-level tests cover the transformation itself; cli.test.ts covers the
 * subprocess exit/stderr contract for pending placeholders.
 */
import { describe, expect, it } from 'vitest'
import { renderMarkdownToWeChatHtml } from '../src/wechat'

function blockLevelElementsMissingStyle(html: string): string[] {
  const missing: string[] = []
  const regex = /<(section|p|div|h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|blockquote|pre|hr|img)\b([^>]*)>/gi
  for (const match of html.matchAll(regex)) {
    if (!/\sstyle=/i.test(match[2]) && match[2].trim() !== ``)
      missing.push(`<${match[1]}${match[2]}>`)
  }
  return missing
}

describe('renderMarkdownToWeChatHtml: WeChat-ready output', () => {
  it('produces zero <style> blocks and zero class attributes for the full fixture body', () => {
    const { html } = renderMarkdownToWeChatHtml('# Hello\n\nWorld.')
    expect((html.match(/<style/g) ?? []).length).toBe(0)
    expect(html.match(/\sclass\s*=/i)).toBeNull()
  }, 30_000)

  it('inlines styles so every block-level element carries a style attribute', () => {
    const markdown = [
      '# Heading',
      '',
      'A paragraph with **bold**.',
      '',
      '- item one',
      '  - nested item',
      '',
      '> a quote',
      '',
      '| A | B |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '```javascript',
      'const a = 1',
      '```',
      '',
      '---',
    ].join('\n')
    const { html } = renderMarkdownToWeChatHtml(markdown)
    const missing = blockLevelElementsMissingStyle(html)
    expect(missing).toEqual([])
  }, 30_000)

  it('resolves hsl() and var() literals to concrete values', () => {
    const { html } = renderMarkdownToWeChatHtml('# T\n\n> quote body\n')
    expect(html).not.toMatch(/hsl\(var\(/)
    expect(html).not.toMatch(/var\(--md-/)
    // hsl(var(--foreground)) resolves to the shell foreground color.
    expect(html).toContain('#3f3f3f')
  }, 30_000)

  it('brackets the output with zero-font-size empty paragraphs', () => {
    const { html } = renderMarkdownToWeChatHtml('Body text.')
    const trimmed = html.trim()
    expect(trimmed.startsWith('<p style="font-size: 0')).toBe(true)
    expect(trimmed).toMatch(/<p style="font-size: 0[^"]*"[^>]*>&nbsp;<\/p>$/)
  }, 30_000)

  it('hoists nested lists out of list items', () => {
    const { html } = renderMarkdownToWeChatHtml('- level one\n  - level two\n')
    expect(html).not.toMatch(/<li[^>]*>(?:(?!<\/li>)[\s\S])*<ul/i)
  }, 30_000)

  it('converts img width/height attributes to inline styles', () => {
    const { html } = renderMarkdownToWeChatHtml('<img src="https://example.com/a.png" width="300" height="200" />')
    expect(html).toMatch(/<img[^>]*style="[^"]*width: 300px/)
    expect(html).toMatch(/<img[^>]*style="[^"]*height: 200px/)
    expect(html).not.toMatch(/<img[^>]*\swidth=/)
  }, 30_000)
})

describe('renderMarkdownToWeChatHtml: pending placeholder detection', () => {
  it('throws for a mermaid code block', () => {
    expect(() => renderMarkdownToWeChatHtml('```mermaid\ngraph TD\nA-->B\n```\n'))
      .toThrow(/mermaid/)
  }, 30_000)

  it('throws for an infographic block', () => {
    expect(() => renderMarkdownToWeChatHtml('```infographic\n{"type":"bar","data":[1,2]}\n```\n'))
      .toThrow(/infographic/)
  }, 30_000)

  it('throws for KaTeX math', () => {
    expect(() => renderMarkdownToWeChatHtml('Euler: $e^{i\\pi}+1=0$\n'))
      .toThrow(/KaTeX/)
  }, 30_000)

  it('throws for an unregistered code language such as go', () => {
    try {
      renderMarkdownToWeChatHtml('```go\nfunc main() {}\n```\n')
      expect.unreachable('expected PendingPlaceholderError')
    }
    catch (error) {
      expect((error as Error).message).toMatch(/go/)
      expect((error as Error).message).toMatch(/browser backend/)
    }
  }, 30_000)

  it('reports a way forward in the error message', () => {
    try {
      renderMarkdownToWeChatHtml('```mermaid\ngraph TD\nA-->B\n```\n')
    }
    catch (error) {
      expect((error as Error).message).toMatch(/handle the diagram manually|fall back to the browser backend/)
      return
    }
    expect.unreachable('expected PendingPlaceholderError')
  }, 30_000)
})
