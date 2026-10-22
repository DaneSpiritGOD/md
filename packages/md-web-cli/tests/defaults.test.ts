import { defaultStyleConfig } from '@md/shared/configs/style'
import { describe, expect, it } from 'vitest'
import { siteDefaultHeadingStyles, siteDefaultRenderConfig } from '../src/defaults'

function format(value: unknown): string {
  return typeof value === `string` ? value : JSON.stringify(value)
}

/**
 * Compares one site default and names the key plus both values on failure, so
 * drift reports say which key moved and in which direction.
 */
function expectSiteDefaultParity(key: string, cliValue: unknown, appValue: unknown): void {
  expect(cliValue, `${key}: CLI=${format(cliValue)} app=${format(appValue)}`).toEqual(appValue)
}

describe(`site default parity between the CLI and the app`, () => {
  it(`lineHeight agrees`, () => {
    expectSiteDefaultParity(`lineHeight`, siteDefaultRenderConfig.lineHeight, defaultStyleConfig.lineHeight)
  })

  it(`blockSpacing agrees`, () => {
    expectSiteDefaultParity(`blockSpacing`, siteDefaultRenderConfig.blockSpacing, defaultStyleConfig.blockSpacing)
  })

  it(`linkColor agrees`, () => {
    expectSiteDefaultParity(`linkColor`, siteDefaultRenderConfig.linkColor, defaultStyleConfig.linkColor)
  })

  it(`blockquoteBackground agrees`, () => {
    expectSiteDefaultParity(
      `blockquoteBackground`,
      siteDefaultRenderConfig.blockquoteBackground,
      defaultStyleConfig.blockquoteBackground,
    )
  })

  it(`headingStyles has the same effective default`, () => {
    // The CLI config carries no headingStyles key; the render path treats
    // absence as "no preset overrides", which is the app's `{}`. Compare that
    // effective value rather than `undefined`.
    expectSiteDefaultParity(`headingStyles`, siteDefaultHeadingStyles, defaultStyleConfig.headingStyles)
  })
})
