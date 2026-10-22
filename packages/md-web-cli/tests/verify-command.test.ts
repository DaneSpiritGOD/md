import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The verify gate's process seam, browser-free half.
 *
 * Argument validation happens before any build or browser work, so these cases
 * exercise the command's contract (exit codes, messages, documented options)
 * without the eight-second Oracle capture. The failure-path coverage that needs
 * a render belongs to the reverse-case self-test.
 */

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), `../../..`)
const scriptPath = path.join(repoRoot, `scripts/verify.mjs`)

function runVerify(args: string[]): { status: number, stdout: string, stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], {
      encoding: `utf-8`,
      cwd: repoRoot,
      stdio: [`ignore`, `pipe`, `pipe`],
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

describe(`verify command: options`, () => {
  it(`documents fixtures, config, and artifact handling in --help`, () => {
    const { status, stdout } = runVerify([`--help`])

    expect(status).toBe(0)
    expect(stdout).toContain(`--fixture`)
    expect(stdout).toContain(`--config`)
    expect(stdout).toContain(`--out-dir`)
    expect(stdout).toContain(`--keep`)
    expect(stdout).toContain(`byte for byte`)
    // The absence of a tolerance is part of the contract, not an implementation
    // detail: it is stated where the maintainer reads the options.
    expect(stdout).toMatch(/no tolerance, allow-list, or known-gaps/)
  })

  it(`rejects an unknown option instead of ignoring it`, () => {
    const { status, stderr } = runVerify([`--frobnicate`])

    expect(status).toBe(1)
    expect(stderr).toContain(`unknown option "--frobnicate"`)
  })

  it(`rejects an option given without a value`, () => {
    const { status, stderr } = runVerify([`--fixture`])

    expect(status).toBe(1)
    expect(stderr).toContain(`--fixture requires a value`)
  })
})

describe(`verify command: missing inputs`, () => {
  it(`fails loudly for an unknown fixture`, () => {
    const { status, stderr } = runVerify([`--fixture`, `no-such-fixture`])

    expect(status).toBe(1)
    expect(stderr).toContain(`fixture not found:`)
    expect(stderr).toContain(`known names: full, minimal`)
  })

  it(`resolves the infrastructure-probe fixture by name`, () => {
    // Reaching the config check proves the fixture name resolved; an unknown
    // name would have failed earlier with "fixture not found".
    const { status, stderr } = runVerify([`--fixture`, `minimal`, `--config`, `no-such-config.json`])

    expect(status).toBe(1)
    expect(stderr).toContain(`config not found:`)
  })

  it(`fails loudly for a config file that does not exist`, () => {
    const { status, stderr } = runVerify([`--fixture`, `full`, `--config`, `no-such-config.json`])

    expect(status).toBe(1)
    expect(stderr).toContain(`config not found:`)
  })
})
