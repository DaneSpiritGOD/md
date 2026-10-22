import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { findInlineStyleProblems, findPendingPlaceholders, findStructuralProblems } from '../../../scripts/verify/structural.mjs'

/**
 * Coverage adapted from the retired verify-snapshot verifier.
 *
 * The script those tests imported is gone from the gate path, but the
 * invariants it protected are not: pending placeholders must never ship, the
 * output must be WeChat-ready, and the reverse-case self-test must prove the
 * gate can fail.
 */

const here = fileURLToPath(import.meta.url)
const repoRoot = resolve(here, '../../../..')
const verifyScript = resolve(repoRoot, 'scripts/verify.mjs')

describe(`pending placeholder detection`, () => {
  it(`finds diagram, katex and language markers, naming each kind`, () => {
    const html = '<div class="mermaid-diagram" data-md-diagram-state="loading"></div><span class="katex-pending">x</span><code data-language-pending="rust">fn</code>'
    const problems = findPendingPlaceholders(html)

    expect(problems.map(problem => problem.kind)).toEqual([
      `pending-diagram`,
      `pending-katex`,
      `pending-language`,
    ])
    expect(problems[2].detail).toContain(`rust`)
  })

  it(`ignores katex-pending selectors inside a style block`, () => {
    expect(findPendingPlaceholders('<style>.katex-pending { color: red }</style><p>x</p>')).toHaveLength(0)
  })
})

describe(`weChat-ready inline style checks`, () => {
  it(`accepts a WeChat-ready artifact`, () => {
    expect(findInlineStyleProblems('<section style="color: red"><p style="margin: 0">x</p></section>')).toHaveLength(0)
  })

  it(`rejects class attributes, style blocks and unstyled block elements`, () => {
    const problems = findInlineStyleProblems('<style>a{}</style><div class="x" style="a"><p>b</p></div>')

    expect(problems.map(problem => problem.kind)).toEqual([
      `style-tag`,
      `class-attribute`,
      `unstyled-block`,
    ])
  })

  it(`exempts the documented structurally-formatted elements`, () => {
    const html = '<table style="border-collapse: collapse"><tbody><tr><td style="border">x</td></tr></tbody></table>'

    expect(findInlineStyleProblems(html)).toHaveLength(0)
  })

  it(`reports every problem class for one artifact`, () => {
    const problems = findStructuralProblems('<p class="x">no style</p><div style="x" data-md-diagram-state="loading"></div>')

    expect(problems.map(problem => problem.kind).sort()).toEqual([`class-attribute`, `pending-diagram`, `unstyled-block`])
  })
})

describe(`reverse-case self-test`, () => {
  it(`exits 0 with every mutant rejected, without launching a browser`, () => {
    const output = execFileSync(process.execPath, [verifyScript, `--self-test`], {
      cwd: repoRoot,
      encoding: `utf-8`,
      stdio: [`ignore`, `pipe`, `pipe`],
      timeout: 120_000,
    })

    for (const name of [
      `injected diagram placeholder`,
      `injected formula placeholder`,
      `injected unregistered-language marker`,
      `stripped inline styles`,
      `injected class attribute`,
      `injected style block`,
      `truncated artifact`,
    ]) {
      expect(output).toContain(`PASS: ${name} -> gate rejects it`)
    }
    expect(output).toContain(`7 reverse case(s)`)
  }, 120_000)
})
