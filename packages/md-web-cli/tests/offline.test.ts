import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

// Node preload that hard-blocks outbound network: any net.connect or fetch
// call during conversion throws immediately.
const POISON = `
const net = require('node:net')
net.Socket.prototype.connect = function () { throw new Error('NETWORK BLOCKED: net.connect') }
globalThis.fetch = () => { throw new Error('NETWORK BLOCKED: fetch') }
`

const distCli = path.resolve(__dirname, '../dist/cli.js')

describe('zero-network conversion', () => {
  let dir: string

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('renders the fixture with net.connect and fetch hard-blocked', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'md-web-cli-net-'))
    const poisonPath = path.join(dir, 'poison.cjs')
    const outPath = path.join(dir, 'out.html')
    await writeFile(poisonPath, POISON)
    execFileSync('node', [
      '--require',
      poisonPath,
      distCli,
      'render',
      path.resolve(__dirname, '../fixtures/full.md'),
      '-o',
      outPath,
    ], { encoding: 'utf-8' })
    const html = await readFile(outPath, 'utf-8')
    expect(html).toContain(`font-family`)
    expect(html.length).toBeGreaterThan(1000)
  })
})
