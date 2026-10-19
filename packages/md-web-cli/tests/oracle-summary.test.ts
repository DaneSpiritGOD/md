import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

/**
 * Smoke test for the Oracle report's structural summary logic (ticket 06).
 * The summary is computed in the browser via page.evaluate; here we verify
 * the same DOM-parsing rules against jsdom so regressions in the extraction
 * shape (counts, key style grabbing, invariants) fail loudly in CI.
 */

const SAMPLE_HTML = [
  '<p style="font-size: 0px; line-height: 0; margin: 0px;">&nbsp;</p>',
  '<section class="container" style="font-size: 16px;">',
  '<h2 class="h2" style="display: table; margin: 4em auto 2em; color: #fff; background: #0F4C81; font-size: 19.2px; text-align: center;">Heading 2</h2>',
  '<blockquote class="blockquote" style="padding: 1em; border-left: 4px solid #0F4C81; background: #f7f7f7; color: #3f3f3f;">quote</blockquote>',
  '<strong style="color: #0F4C81;">bold</strong>',
  '<pre><span class="mac-sign" style="padding: 10px 14px 0;">dots</span><code>code</code></pre>',
  '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>',
].join(``)

function summarize(html) {
  const root = new JSDOM(html).window.document
  const output = root.body
  const count = selector => output.querySelectorAll(selector).length
  const firstMatchStyle = (selector) => {
    const el = output.querySelector(selector)
    if (!el)
      return null
    const raw = el.getAttribute(`style`) ?? ``
    const grab = (prop) => {
      const match = raw.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, `i`))
      return match ? match[1].trim() : null
    }
    return {
      background: grab(`background`) ?? grab(`background-color`),
      fontSize: grab(`font-size`),
      textAlign: grab(`text-align`),
      borderLeft: grab(`border-left`),
      color: grab(`color`),
    }
  }
  return {
    counts: {
      h2: count(`h2`),
      blockquote: count(`blockquote`),
      pre: count(`pre`),
      table: count(`table`),
      strong: count(`strong`),
      span_macSign: count(`span.mac-sign`),
    },
    keyStyles: {
      h2: firstMatchStyle(`h2`),
      blockquote: firstMatchStyle(`blockquote`),
      strong: firstMatchStyle(`strong`),
      sectionRoot: firstMatchStyle(`section`),
    },
    hasStyleTag: !!root.querySelector(`style`),
    hasClassAttributes: /\sclass\s*=\s*["']/.test(html),
  }
}

describe(`oracle structural summary`, () => {
  it(`counts elements per type`, () => {
    const summary = summarize(SAMPLE_HTML)
    expect(summary.counts).toEqual({
      h2: 1,
      blockquote: 1,
      pre: 1,
      table: 1,
      strong: 1,
      span_macSign: 1,
    })
  })

  it(`extracts key inline styles post-juice`, () => {
    const summary = summarize(SAMPLE_HTML)
    expect(summary.keyStyles.h2).toEqual({
      background: `#0F4C81`,
      fontSize: `19.2px`,
      textAlign: `center`,
      borderLeft: null,
      color: `#fff`,
    })
    expect(summary.keyStyles.blockquote).toMatchObject({
      borderLeft: `4px solid #0F4C81`,
      background: `#f7f7f7`,
    })
    expect(summary.keyStyles.strong?.color).toBe(`#0F4C81`)
    expect(summary.keyStyles.sectionRoot?.fontSize).toBe(`16px`)
  })

  it(`reports the copy-flow invariants`, () => {
    const summary = summarize(SAMPLE_HTML)
    // The browser copy flow never emits a <style> tag...
    expect(summary.hasStyleTag).toBe(false)
    // ...but class stripping is the CLI's WeChat wrapper step, so classes
    // are expected to still be present in the Oracle HTML.
    expect(summary.hasClassAttributes).toBe(true)
  })
})
