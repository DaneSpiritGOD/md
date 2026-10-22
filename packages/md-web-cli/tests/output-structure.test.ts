import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'

/**
 * Behavioural guard for WeChat-ready output produced through the real CLI path.
 *
 * The verify gate asserts these invariants on its own output, but it only sees
 * what the built bundle produces. A regression that drops juice or class
 * stripping inside the renderer would be caught there — late, and only if the
 * gate runs. This file pins the same behaviour at the source so the fast suite
 * fails first.
 */
import { renderMarkdownToWeChatHtml } from '../src/wechat'

const fixture = new URL('../fixtures/full.md', import.meta.url)
const fixturePath = path.resolve(fixture.pathname)
const repoRoot = path.resolve(fixturePath, '../../../..')

const BLOCK_TAGS = 'section|p|div|h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|blockquote|pre|hr|img'

it('fixture render is WeChat-ready: no <style>, no class attributes, inline styles everywhere', async () => {
  const { readFileSync } = await import('node:fs')
  const { html } = renderMarkdownToWeChatHtml(readFileSync(fixturePath, 'utf-8'))
  expect(html).not.toMatch(/<style/)
  expect(html).not.toMatch(/\sclass\s*=/i)
  const missing = []
  for (const match of html.matchAll(new RegExp(`<(${BLOCK_TAGS})\\b([^>]*)>`, 'gi'))) {
    const attrs = match[2]
    // Structural wrappers legitimately carry no style (table sections, rows).
    if (!/\sstyle\s*=/i.test(attrs) && attrs.trim() !== '')
      missing.push(`<${match[1]}${attrs}>`)
  }
  expect(missing).toEqual([])
})

it('the gate structural assertions accept a real CLI render of the fixture', async () => {
  const { readFileSync } = await import('node:fs')
  const { findStructuralProblems } = await import('../../../scripts/verify/structural.mjs')
  const { execFileSync } = await import('node:child_process')
  const dir = mkdtempSync(path.join(tmpdir(), 'md-web-cli-struct-'))
  try {
    const out = path.join(dir, 'out.html')
    execFileSync(process.execPath, [path.join(repoRoot, 'packages/md-web-cli/dist/cli.js'), 'render', fixturePath, '-o', out])
    const html = readFileSync(out, 'utf-8')
    expect(findStructuralProblems(html)).toEqual([])
    expect(html.match(/<h2\b/g)?.length ?? 0).toBeGreaterThan(0)
    expect(html.match(/<pre\b/g)?.length ?? 0).toBeGreaterThan(0)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
}, 60_000)
