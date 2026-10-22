import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * Run the verify command as a subprocess.
 *
 * The gate's contract is a process boundary — exit code, printed summary,
 * artifacts written — so tests exercise it the way a maintainer does rather
 * than importing its internals.
 */

const here = fileURLToPath(import.meta.url)

export const repoRoot = path.resolve(path.dirname(here), '../../../..')
export const verifyScript = path.join(repoRoot, 'scripts/verify.mjs')

export interface VerifyResult {
  status: number
  stdout: string
  stderr: string
}

export function runVerify(args: string[], timeout = 120_000): VerifyResult {
  try {
    const stdout = execFileSync(process.execPath, [verifyScript, ...args], {
      encoding: `utf-8`,
      cwd: repoRoot,
      stdio: [`ignore`, `pipe`, `pipe`],
      timeout,
    })
    return { status: 0, stdout, stderr: `` }
  }
  catch (error: any) {
    return {
      status: error.status ?? 1,
      stdout: error.stdout ?? ``,
      stderr: error.stderr ?? String(error.message),
    }
  }
}
