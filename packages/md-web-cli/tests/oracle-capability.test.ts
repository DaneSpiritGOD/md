import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

// The Oracle capability lives outside the package (scripts/verify/oracle.mjs)
// and is imported rather than re-implemented, so the repository guard and the
// build precondition are observed through its public entry point. Neither
// case launches a browser: both fail before Playwright is loaded.
const here = fileURLToPath(import.meta.url)
const repoRoot = resolve(here, '../../../..')
const capabilityPath = resolve(repoRoot, 'scripts/verify/oracle.mjs')
const fixturePath = resolve(repoRoot, 'packages/md-web-cli/fixtures/full.md')

const { captureOracle } = await import(capabilityPath)

const tempDirs: string[] = []

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'md-web-cli-oracle-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('captureOracle repository guard', () => {
  it('refuses an output directory inside the repository', async () => {
    const outDir = resolve(repoRoot, 'packages/md-web-cli/tests/.oracle-should-not-exist')

    await expect(captureOracle({ fixturePath, outDir })).rejects.toThrow(/repository/i)
  })
})

describe('captureOracle build precondition', () => {
  it('fails loudly when the web application has not been built', async () => {
    const outDir = await makeTempDir()
    const distDir = join(outDir, 'missing-dist')

    await expect(captureOracle({ fixturePath, outDir, distDir })).rejects.toThrow(/pnpm --filter @md\/web build:only/)
  })
})
