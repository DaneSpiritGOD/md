import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const cliPath = path.join(root, 'dist/cli.js')
const fixturePath = path.join(root, 'fixtures/full.md')

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-web-cli-'))
  tmpDirs.push(dir)
  return dir
}

function runCli(args: string[]): { status: number, stdout: string, stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [cliPath, ...args], {
      encoding: 'utf-8',
      // Belt and braces for the zero-network requirement: point fetch proxies at nothing.
      env: { ...process.env, HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1' },
    })
    return { status: 0, stdout, stderr: '' }
  }
  catch (error: any) {
    return {
      status: error.status ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? String(error.message),
    }
  }
}

afterAll(() => {
  for (const dir of tmpDirs)
    fs.rmSync(dir, { recursive: true, force: true })
})

describe('cli subprocess: render', () => {
  it('converts the fixture to WeChat-ready HTML with inlined styles and full body', () => {
    const dir = makeTmpDir()
    const out = path.join(dir, 'out.html')
    const result = runCli(['render', fixturePath, '-o', out])

    expect(result.status).toBe(0)
    expect(fs.existsSync(out)).toBe(true)
    const html = fs.readFileSync(out, 'utf-8')
    // Ticket 04: no <style> block — everything is inlined into style attributes.
    expect((html.match(/<style/g) ?? []).length).toBe(0)
    expect(html).not.toMatch(/\sclass\s*=/i)
    expect(html).toContain('font-family')
    // Mac code-block title bar survives class stripping as an inlined span.
    expect(html).toContain('padding: 10px 14px 0')
  }, 30_000)

  it('exits non-zero with a clear stderr message for a missing input file', () => {
    const dir = makeTmpDir()
    const out = path.join(dir, 'out.html')
    const result = runCli(['render', path.join(dir, 'missing.md'), '-o', out])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/Input file not found/)
  })

  it('exits non-zero when -o is missing', () => {
    const result = runCli(['render', fixturePath])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/-o/)
  })

  it('rejects unknown commands', () => {
    const result = runCli(['frobnicate'])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/Unknown command/)
  })
})

describe('cli subprocess: WeChat output + pending placeholders (ticket 04)', () => {
  function writeFixture(dir: string, content: string): string {
    const file = path.join(dir, 'in.md')
    fs.writeFileSync(file, content, 'utf-8')
    return file
  }

  it('clean fixture exits zero, empty stderr, WeChat-ready output without placeholder residue', () => {
    const dir = makeTmpDir()
    const out = path.join(dir, 'out.html')
    const result = runCli(['render', fixturePath, '-o', out])

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(fs.existsSync(out)).toBe(true)
    const html = fs.readFileSync(out, 'utf-8')
    expect((html.match(/<style/g) ?? []).length).toBe(0)
    expect(html.match(/\sclass\s*=/i)).toBeNull()
    expect(html).not.toMatch(/data-md-diagram-state="loading"/)
    expect(html).not.toMatch(/data-language-pending/)
    expect(html).not.toMatch(/Loading Mermaid|Loading infographic|Loading PlantUML/)
    // Every block-level element carries an inline style. Bare <tr> is
    // acceptable: the renderer emits styled cells, and WeChat ignores tr styles.
    for (const match of html.matchAll(/<(section|p|h[1-6]|ul|ol|li|table|th|td|blockquote|pre)\b([^>]*)>/gi)) {
      expect(match[2]).toMatch(/\sstyle=/i)
    }
  }, 60_000)

  it('mermaid fence exits non-zero, writes no output file, explains cause and way forward', () => {
    const dir = makeTmpDir()
    const out = path.join(dir, 'out.html')
    const input = writeFixture(dir, '# Diagram\n\n```mermaid\ngraph TD\nA-->B\n```\n')
    const result = runCli(['render', input, '-o', out])

    expect(result.status).not.toBe(0)
    expect(fs.existsSync(out)).toBe(false)
    expect(result.stderr).toMatch(/mermaid/i)
    expect(result.stderr).toMatch(/handle the diagram manually|fall back to the browser backend/i)
  }, 60_000)

  it('katex syntax exits non-zero the same way', () => {
    const dir = makeTmpDir()
    const out = path.join(dir, 'out.html')
    const input = writeFixture(dir, 'Math: $e^{i\\pi}+1=0$\n')
    const result = runCli(['render', input, '-o', out])

    expect(result.status).not.toBe(0)
    expect(fs.existsSync(out)).toBe(false)
    expect(result.stderr).toMatch(/KaTeX/i)
    expect(result.stderr).toMatch(/fall back to the browser backend/i)
  }, 60_000)

  it('infographic block exits non-zero the same way', () => {
    const dir = makeTmpDir()
    const out = path.join(dir, 'out.html')
    const input = writeFixture(dir, '```infographic\n{"type":"bar","data":[1,2]}\n```\n')
    const result = runCli(['render', input, '-o', out])

    expect(result.status).not.toBe(0)
    expect(fs.existsSync(out)).toBe(false)
    expect(result.stderr).toMatch(/infographic/i)
    expect(result.stderr).toMatch(/handle the diagram manually|fall back to the browser backend/i)
  }, 60_000)

  it('unregistered code language (go) exits non-zero the same way', () => {
    const dir = makeTmpDir()
    const out = path.join(dir, 'out.html')
    const input = writeFixture(dir, '```go\nfunc main() {}\n```\n')
    const result = runCli(['render', input, '-o', out])

    expect(result.status).not.toBe(0)
    expect(fs.existsSync(out)).toBe(false)
    expect(result.stderr).toMatch(/\bgo\b/)
    expect(result.stderr).toMatch(/fall back to the browser backend/i)
  }, 60_000)
})
