/**
 * Repository path guard shared by the verify gate and the Oracle capability.
 *
 * The Oracle is a runtime capability, never a committed artifact: anything it
 * produces, and anything the gate preserves for debugging, has to live outside
 * the repository so no regenerable output can be committed by accident.
 */

import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export const REPO_ROOT = resolve(HERE, `../..`)

export function isInsideRepository(dir) {
  const resolved = resolve(dir)
  return resolved === REPO_ROOT || resolved.startsWith(`${REPO_ROOT}${sep}`)
}

export function assertOutsideRepository(dir, what = `output directory`) {
  const resolved = resolve(dir)
  if (isInsideRepository(resolved)) {
    throw new Error(
      `${what} must be outside the repository (received ${resolved}). `
      + `Rendered output is regenerable, so it is never written into the tree; pass a temp directory.`,
    )
  }
  return resolved
}
