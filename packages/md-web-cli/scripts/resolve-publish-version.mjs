import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * Resolve the publish version from the manifest version and the registry's
 * latest published version.
 *
 * Rule (issue #9): MAJOR.MINOR is hand-edited in the manifest; PATCH is
 * automatic.
 * - registry latest is unknown (not published yet) or its (MAJOR, MINOR)
 *   differs from the manifest's → publish the manifest version as-is.
 * - otherwise → registry PATCH + 1.
 *
 * Returns the version string; never writes back to git (npm version is run
 * with --no-git-tag-version in the caller).
 */
export function resolvePublishVersion(manifestVersion, registryVersion) {
  if (!manifestVersion || typeof manifestVersion !== 'string') {
    throw new Error(`Invalid manifest version: ${JSON.stringify(manifestVersion)}`)
  }
  if (registryVersion == null) {
    return manifestVersion
  }
  if (typeof registryVersion !== 'string') {
    throw new TypeError(`Invalid registry version: ${JSON.stringify(registryVersion)}`)
  }
  const manifest = parseSemver(manifestVersion)
  const registry = parseSemver(registryVersion)
  if (manifest.major !== registry.major || manifest.minor !== registry.minor) {
    return manifestVersion
  }
  return `${manifest.major}.${manifest.minor}.${registry.patch + 1}`
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].+)?$/.exec(version.trim())
  if (!match) {
    throw new Error(`Unparseable semver: ${version}`)
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

async function main() {
  const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
  const registryVersion = await queryRegistryVersion(pkg.name)
  const next = resolvePublishVersion(pkg.version, registryVersion)
  console.log(`registry latest: ${registryVersion ?? '(none)'}`)
  console.log(`manifest version: ${pkg.version}`)
  console.log(`resolved publish version: ${next}`)
  // Written to the GitHub Actions output; applied with
  // `npm version --no-git-tag-version` by the publish workflow.
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${next}\n`)
  }
}

/**
 * Query the registry for the latest published version. A 404 (package never
 * published) resolves to null. Never reads .npmrc auth; OIDC trusted
 * publishing needs no token for read-only registry queries.
 */
export async function queryRegistryVersion(name, registryUrl = 'https://registry.npmjs.org') {
  const res = await fetch(`${registryUrl}/${encodeURIComponent(name).replace(/^%40/, '@')}`)
  if (res.status === 404) {
    return null
  }
  if (!res.ok) {
    throw new Error(`Registry query failed: HTTP ${res.status} for ${name}`)
  }
  const data = await res.json()
  return data['dist-tags']?.latest ?? null
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  await main()
}
