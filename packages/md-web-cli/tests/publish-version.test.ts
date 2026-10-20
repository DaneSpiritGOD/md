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

  describe('boundary inputs', () => {
    it('ignores build metadata on the registry version', () => {
      expect(resolvePublishVersion('1.2.3', '1.2.3+build.7')).toBe('1.2.4')
    })

    it('treats a registry prerelease as its numeric base', () => {
      // registry 1.2.4-alpha parses to patch 4, so the next stable is 1.2.5.
      expect(resolvePublishVersion('1.2.3', '1.2.4-alpha')).toBe('1.2.5')
    })

    it('trims surrounding whitespace', () => {
      expect(resolvePublishVersion(' 1.2.3 ', '1.2.3\n')).toBe('1.2.4')
    })

    it('does not reject leading zeros (documented limitation)', () => {
      // Strict semver forbids `1.02.3`, but this regex accepts it and parses
      // it as 1.2.3 on either side. Both inputs are repo/registry-generated,
      // so the leniency only shows up in hand-edited manifests; pinned here.
      expect(resolvePublishVersion('1.02.3', '1.2.3')).toBe('1.2.4')
      expect(resolvePublishVersion('1.2.3', '01.2.3')).toBe('1.2.4')
    })

    it('rejects a v-prefixed registry version (documented limitation)', () => {
      // npm's dist-tags never carry a `v` prefix; if a registry ever returns
      // one, failing loudly is preferable to publishing a guessed version.
      expect(() => resolvePublishVersion('1.2.3', 'v1.2.3')).toThrow(/Unparseable semver/)
    })

    it('loses precision above Number.MAX_SAFE_INTEGER (documented limitation)', () => {
      // PATCH is handled as a JS number. npm versions never get this far, but
      // the behaviour is pinned so a future parser change is a conscious one.
      expect(resolvePublishVersion('1.2.3', '1.2.9007199254740993')).toBe('1.2.9007199254740992')
    })

    it('never returns a version lower than the registry when MAJOR.MINOR match', () => {
      expect(resolvePublishVersion('0.0.0', '0.0.0')).toBe('0.0.1')
      expect(resolvePublishVersion('9.9.0', '9.9.99')).toBe('9.9.100')
    })
  })
})
