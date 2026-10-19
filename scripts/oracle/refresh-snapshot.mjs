/**
 * Regenerate the golden snapshot (ticket 08).
 *
 * Renders packages/md-web-cli/fixtures/full.md with the CLI bundle and
 * writes the WeChat-ready output to packages/md-web-cli/golden/snapshot.html
 * (committed). The snapshot is the semantic baseline the Tier 2 gate
 * (scripts/oracle/verify-snapshot.mjs) compares fresh renders against.
 *
 * Run: pnpm oracle:refresh-snapshot   (builds the bundle first)
 * Verify: pnpm oracle:verify-snapshot
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')
const SNAPSHOT_PATH = resolve(REPO_ROOT, 'packages/md-web-cli/golden/snapshot.html')
const FIXTURE_PATH = resolve(REPO_ROOT, 'packages/md-web-cli/fixtures/full.md')
const CLI_PATH = resolve(REPO_ROOT, 'packages/md-web-cli/dist/cli.js')

execFileSync('pnpm', ['--filter', '@dane.dai/md-web-cli', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' })
mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true })
execFileSync(process.execPath, [CLI_PATH, 'render', FIXTURE_PATH, '-o', SNAPSHOT_PATH], { cwd: REPO_ROOT, stdio: 'inherit' })

// Deterministic output: the render embeds no timestamp, but keep a leading
// provenance comment documenting how the file is regenerated.
const html = readFileSync(SNAPSHOT_PATH, 'utf-8')
const banner = `<!-- Golden snapshot (ticket 08): CLI render of packages/md-web-cli/fixtures/full.md. Regenerate with: pnpm oracle:refresh-snapshot. Verified by: pnpm oracle:verify-snapshot -->\n`
if (!html.startsWith('<!--'))
  writeFileSync(SNAPSHOT_PATH, `${banner}${html}`)

console.log(`[refresh-snapshot] wrote ${SNAPSHOT_PATH} (${readFileSync(SNAPSHOT_PATH).length} bytes)`)
process.exit(0)
