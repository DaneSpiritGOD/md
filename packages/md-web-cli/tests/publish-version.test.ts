import { describe, expect, it } from 'vitest'
import { resolvePublishVersion } from '../scripts/resolve-publish-version.mjs'

describe('resolvePublishVersion', () => {
  it('publishes manifest version as-is when never published', () => {
    expect(resolvePublishVersion('0.1.0', null)).toBe('0.1.0')
    expect(resolvePublishVersion('1.2.3', undefined)).toBe('1.2.3')
  })

  it('publishes manifest version as-is when (MAJOR, MINOR) differs from registry', () => {
    // Hand-edited MINOR bump: publish exactly what the manifest says.
    expect(resolvePublishVersion('0.2.0', '0.1.7')).toBe('0.2.0')
    expect(resolvePublishVersion('1.0.0', '0.9.9')).toBe('1.0.0')
    // Manifest lower than registry (e.g. revert) still publishes as-is.
    expect(resolvePublishVersion('0.1.0', '0.2.5')).toBe('0.1.0')
  })

  it('increments registry PATCH when (MAJOR, MINOR) matches', () => {
    expect(resolvePublishVersion('0.1.0', '0.1.0')).toBe('0.1.1')
    expect(resolvePublishVersion('0.1.0', '0.1.7')).toBe('0.1.8')
    expect(resolvePublishVersion('1.2.3', '1.2.41')).toBe('1.2.42')
  })

  it('ignores manifest PATCH when (MAJOR, MINOR) matches (PATCH is automatic)', () => {
    expect(resolvePublishVersion('0.1.9', '0.1.3')).toBe('0.1.4')
  })

  it('handles prerelease registry versions by using their numeric base patch', () => {
    // 0.1.5-beta.2 parses to (0,1,5); next is 0.1.6.
    expect(resolvePublishVersion('0.1.0', '0.1.5-beta.2')).toBe('0.1.6')
  })

  it('rejects unparseable versions', () => {
    expect(() => resolvePublishVersion('not-semver', '1.2.0')).toThrow()
    expect(() => resolvePublishVersion('1.2', '1.2.0')).toThrow()
    expect(() => resolvePublishVersion('1.2.3', 'garbage')).toThrow()
    expect(() => resolvePublishVersion('', null)).toThrow()
  })
})
