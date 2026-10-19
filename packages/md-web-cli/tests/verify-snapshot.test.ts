import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The verifier lives at scripts/oracle (outside the package) and shares the
// md-web-cli jsdom install via scripts/oracle/lib/extract.mjs. Import its
// functions directly and run the script's self-test as a subprocess so CI's
// normal test pass exercises the full gate including exit codes.
const here = fileURLToPath(import.meta.url)
const scriptPath = resolve(here, '../../../../scripts/oracle/verify-snapshot.mjs')
const repoRoot = resolve(here, '../../../..')
const snapshotPath = resolve(repoRoot, 'packages/md-web-cli/golden/snapshot.html')
const fixturePath = resolve(repoRoot, 'packages/md-web-cli/fixtures/full.md')
const cliPath = resolve(repoRoot, 'packages/md-web-cli/dist/cli.js')

const { evaluateArtifact, findInlineStyleProblems, findPendingPlaceholders, parseArgs } = await import(scriptPath)

const snapshot = () => readFileSync(snapshotPath, 'utf-8')

describe('verify-snapshot args', () => {
  it('defaults to the repo fixture, snapshot and CLI bundle', () => {
    const args = parseArgs(['node', 'verify-snapshot.mjs'])
    expect(args.fixture).toBe(fixturePath)
    expect(args.snapshot).toBe(snapshotPath)
    expect(args.cli).toBe(cliPath)
    expect(args.selfTest).toBe(false)
  })

  it('parses explicit overrides and --self-test', () => {
    const args = parseArgs(['node', 'verify-snapshot.mjs', '--fixture', 'a.md', '--snapshot', 'b.html', '--cli', 'c.js', '--self-test'])
    expect(args.fixture).toBe(resolve(process.cwd(), 'a.md'))
    expect(args.snapshot).toBe(resolve(process.cwd(), 'b.html'))
    expect(args.cli).toBe(resolve(process.cwd(), 'c.js'))
    expect(args.selfTest).toBe(true)
  })
})

describe('pending placeholder detection', () => {
  it('finds diagram, katex and language markers', () => {
    const html = '<div class="mermaid-diagram" data-md-diagram-state="loading"></div><span class="katex-pending">x</span><code data-language-pending="rust">fn</code>'
    const pending = findPendingPlaceholders(html)
    expect(pending).toHaveLength(3)
    expect(pending[0]).toContain('async diagram')
    expect(pending[1]).toContain('KaTeX')
    expect(pending[2]).toContain('rust')
  })

  it('ignores katex-pending selectors inside a style block', () => {
    expect(findPendingPlaceholders('<style>.katex-pending { color: red }</style><p>x</p>')).toHaveLength(0)
  })
})

describe('inline style checks', () => {
  it('accepts a WeChat-ready artifact', () => {
    expect(findInlineStyleProblems('<section style="color: red"><p style="margin: 0">x</p></section>')).toHaveLength(0)
  })

  it('rejects class attributes, style tags and unstyled block elements', () => {
    const problems = findInlineStyleProblems('<style>a{}</style><div class="x" style="a"><p>b</p></div>')
    expect(problems.some(p => p.includes('<style>'))).toBe(true)
    expect(problems.some(p => p.includes('class attribute'))).toBe(true)
    expect(problems.filter(p => p.includes('without style')).length).toBe(1)
  })

  it('exempts structurally formatted elements from the style requirement', () => {
    expect(findInlineStyleProblems('<table style="border-collapse: collapse"><tbody><tr><td style="border">x</td></tr></tbody></table>')).toHaveLength(0)
  })
})

describe('evaluateArtifact (the gate)', () => {
  it('passes on a byte-identical copy of the golden snapshot', () => {
    expect(evaluateArtifact(snapshot(), snapshot())).toHaveLength(0)
  })

  it('fails on an injected pending placeholder', () => {
    const mutant = snapshot().replace('<section', '<section data-language-pending="rust" data-md-diagram-state="loading" class="mermaid-diagram"')
    const reasons = evaluateArtifact(mutant, snapshot())
    expect(reasons.some(r => r.includes('pending placeholder'))).toBe(true)
  })

  it('fails on stripped inline styles', () => {
    const mutant = snapshot().replace(/\sstyle\s*=\s*(["'])[\s\S]*?\1/gi, '')
    const reasons = evaluateArtifact(mutant, snapshot())
    expect(reasons.some(r => r.includes('inline styles'))).toBe(true)
  })

  it('fails on a truncated artifact', () => {
    const mutant = snapshot().slice(0, Math.floor(snapshot().length / 2))
    const reasons = evaluateArtifact(mutant, snapshot())
    expect(reasons.some(r => r.includes('snapshot mismatch'))).toBe(true)
  })
})

describe('self-test subprocess', () => {
  it('exits 0 with every reverse case failing the gate', () => {
    // pretest already built the bundle; run the script's own self-test.
    const out = execFileSync(process.execPath, [scriptPath, '--self-test'], { cwd: repoRoot, encoding: 'utf-8' })
    expect(out).toContain('PASS: pending placeholder injection')
    expect(out).toContain('PASS: inline style stripping')
    expect(out).toContain('PASS: truncation')
  })
}, 60_000)
