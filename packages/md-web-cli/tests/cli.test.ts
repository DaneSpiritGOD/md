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
  it('converts the fixture to HTML containing the theme <style> block and full body', () => {
    const dir = makeTmpDir()
    const out = path.join(dir, 'out.html')
    const result = runCli(['render', fixturePath, '-o', out])

    expect(result.status).toBe(0)
    expect(fs.existsSync(out)).toBe(true)
    const html = fs.readFileSync(out, 'utf-8')
    expect(html.startsWith('<style>')).toBe(true)
    expect(html).toContain('</style>')
    expect(html).toContain('preview-table')
    expect(html).toContain('mac-sign')
    expect(html).toContain('--md-font-size: 16px')
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
