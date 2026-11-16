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
    // Class attributes are legitimately present (kept for byte-parity with the
    // browser), so the structural check no longer flags them; the byte
    // comparison rejects a mutant that adds one where the known-good render
    // had none.
    expectKind: null,
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
 * A body reverse case: the body gate must reject a body that gained a stray
 * byte (here, an injected `<style>` block). Without this, the body comparison
 * could be a pass-only gate that can never prove it can fail.
 */
const BODY_CASES = [
  {
    name: `body injected style block`,
    mutate: body => `<style>p { color: red }</style>${body}`,
  },
  {
    name: `body mutated byte`,
    mutate: body => body.replace(`</style>`, `</style> `),
  },
]

/**
 * @param {string} knownGoodHtml A CLI render that already passes the structural
 *   assertions.
 * @param {string} knownGoodBody The CLI body fragment (--raw-body) for the same
 *   fixture, known good.
 * @returns {{baselineProblems: Array, positiveControl: boolean, cases: Array<{name: string, rejected: boolean, expectedKind: string|null, matchedKinds: string[], expectedKindFound: boolean, firstReason: string}>, bodyCases: Array<{name: string, rejected: boolean, firstReason: string}>}}
 */
export function runSelfTest(knownGoodHtml, knownGoodBody) {
  const baselineProblems = findStructuralProblems(knownGoodHtml)
  // Positive control: a comparator that always reports a difference would make
  // every reverse case "pass" for the wrong reason.
  const positiveControl = compareOutputs(knownGoodHtml, knownGoodHtml).equal

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
      rejected: !comparison.equal && expectedKindFound,
      expectedKindFound,
      firstReason: problems[0]?.detail ?? `byte comparison rejected the mutant`,
    }
  })

  const bodyPositiveControl = compareOutputs(knownGoodBody, knownGoodBody).equal
  const bodyCases = BODY_CASES.map((testCase) => {
    const mutant = testCase.mutate(knownGoodBody)
    const comparison = compareOutputs(knownGoodBody, mutant)
    return {
      name: testCase.name,
      rejected: !comparison.equal && bodyPositiveControl,
      firstReason: `byte comparison rejected the body mutant`,
    }
  })

  return { baselineProblems, positiveControl, cases, bodyCases }
}
