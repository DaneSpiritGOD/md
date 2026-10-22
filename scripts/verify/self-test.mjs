/**
 * Reverse-case self-test: proof that the gate can fail.
 *
 * A gate that never fails is indistinguishable from a broken gate, so this mode
 * corrupts a known-good render several distinct ways and asserts that each
 * mutant is rejected. It needs no browser: the known-good render comes from the
 * CLI bundle.
 */

import { compareOutputs } from './compare.mjs'
import { findStructuralProblems } from './structural.mjs'

const CASES = [
  {
    name: `injected diagram placeholder`,
    expectKind: `pending-diagram`,
    mutate: html => html.replace(`<section`, `<div data-md-diagram-state="loading"></div><section`),
  },
  {
    name: `injected formula placeholder`,
    expectKind: `pending-katex`,
    mutate: html => html.replace(`<section`, `<section><span class="katex-pending">x</span>`),
  },
  {
    name: `injected unregistered-language marker`,
    expectKind: `pending-language`,
    mutate: html => html.replace(`<section`, `<section><code data-language-pending="rust">fn</code>`),
  },
  {
    name: `stripped inline styles`,
    expectKind: `unstyled-block`,
    mutate: html => html.replace(/\sstyle\s*=\s*(["'])[\s\S]*?\1/gi, ``),
  },
  {
    name: `injected class attribute`,
    expectKind: `class-attribute`,
    mutate: html => html.replace(/<p\b/, `<p class="leaked"`),
  },
  {
    name: `injected style block`,
    expectKind: `style-tag`,
    mutate: html => `<style>p { color: red }</style>${html}`,
  },
  {
    name: `truncated artifact`,
    expectKind: null,
    mutate: html => html.slice(0, Math.floor(html.length / 2)),
  },
]

/**
 * @param {string} knownGoodHtml A CLI render that already passes the structural
 *   assertions.
 * @returns {{baselineProblems: Array, cases: Array<{name: string, rejected: boolean, expectedKind: string|null, matchedKinds: string[], compareRejected: boolean, firstReason: string}>}}
 */
export function runSelfTest(knownGoodHtml) {
  const baselineProblems = findStructuralProblems(knownGoodHtml)

  const cases = CASES.map((testCase) => {
    const mutant = testCase.mutate(knownGoodHtml)
    const problems = findStructuralProblems(mutant)
    const matchedKinds = problems.map(problem => problem.kind)
    const comparison = compareOutputs(knownGoodHtml, mutant)
    const expectedKindFound = testCase.expectKind === null || matchedKinds.includes(testCase.expectKind)
    return {
      name: testCase.name,
      expectedKind: testCase.expectKind,
      matchedKinds,
      compareRejected: !comparison.equal,
      rejected: !comparison.equal && expectedKindFound,
      expectedKindFound,
      firstReason: problems[0]?.detail ?? `byte comparison rejected the mutant`,
    }
  })

  return { baselineProblems, cases }
}
