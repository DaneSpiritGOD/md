import type { AddressInfo } from 'node:net'
import { execFileSync } from 'node:child_process'

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer as createTcpServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * Zero-network conversion, proven by observation rather than by a proxy
 * setting.
 *
 * A loopback TCP "sink" counts every inbound connection. While it listens, the
 * CLI renders the fixture in a child process preloaded with a poison module:
 *
 *   - `net.Socket.prototype.connect` and `fetch` throw, so a render that needs
 *     the network fails loudly instead of silently succeeding. (This replaces
 *     the old HTTP_PROXY env vars, which guard nothing: Node's fetch ignores
 *     HTTP_PROXY unless --use-env-proxy is passed.)
 *   - The sink makes a dial *visible*: it counts connections, so an attempt
 *     through proxy env vars pointed at the sink would be recorded instead of
 *     merely failing.
 *
 * The CLI is launched as a file so process.argv keeps the CLI's shape; the
 * preload's connect wrapper re-enables only connections made to the sink
 * (harness self-check) and leaves every other target poisoned.
 */
const POISON = `
const net = require('node:net')
const target = Number(process.env.MD_WEB_CLI_SINK_PORT)
const originalConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const options = typeof args[0] === 'object' && args[0] !== null
    ? args[0]
    : { port: args[0], host: args[1] }
  if (target && Number(options.port) === target && options.host === '127.0.0.1')
    return originalConnect.apply(this, args)
  throw new Error('NETWORK BLOCKED: net.connect')
}
globalThis.fetch = () => { throw new Error('NETWORK BLOCKED: fetch') }
`

const distCli = path.resolve(__dirname, '../dist/cli.js')
const fixture = path.resolve(__dirname, '../fixtures/full.md')

interface Sink {
  server: ReturnType<typeof createTcpServer>
  port: number
  counts: { requests: number, connections: number }
}

async function startSink(): Promise<Sink> {
  const counts = { requests: 0, connections: 0 }
  // Raw TCP: every connection is observable, whether or not it speaks HTTP.
  const server = createTcpServer((socket) => {
    counts.connections++
    socket.on('data', () => { counts.requests++ })
    socket.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, port: (server.address() as AddressInfo).port, counts }
}

function closeSink(sink: Sink): Promise<void> {
  return new Promise(resolve => sink.server.close(() => resolve()))
}

describe('zero-network conversion', () => {
  let dir: string

  afterAll(async () => {
    if (dir)
      await rm(dir, { recursive: true, force: true })
  })

  async function render(outName: string, env: Record<string, string>, port?: number) {
    const poisonPath = path.join(dir, 'poison.cjs')
    const outPath = path.join(dir, outName)
    await writeFile(poisonPath, POISON)
    const stdout = execFileSync(process.execPath, [
      '--require',
      poisonPath,
      distCli,
      'render',
      fixture,
      '-o',
      outPath,
    ], {
      encoding: 'utf-8',
      env: { ...process.env, MD_WEB_CLI_SINK_PORT: port ? String(port) : '', ...env },
    })
    return { stdout, html: await readFile(outPath, 'utf-8') }
  }

  it('renders the fixture with net.connect and fetch poisoned, leaving the sink silent', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'md-web-cli-net-'))
    const sink = await startSink()
    const { html } = await render('out.html', {}, sink.port)
    expect(html).toContain(`font-family`)
    expect(html.length).toBeGreaterThan(1000)
    expect(sink.counts).toEqual({ requests: 0, connections: 0 })
    await closeSink(sink)
  }, 60_000)

  it('stays silent even with proxy env vars pointed at the sink', async () => {
    // If the renderer ever starts honouring proxies, that traffic lands here
    // and the counters fail the test.
    const sink = await startSink()
    const proxy = `http://127.0.0.1:${sink.port}`
    await render('out-proxy.html', {
      HTTP_PROXY: proxy,
      HTTPS_PROXY: proxy,
      ALL_PROXY: proxy,
      http_proxy: proxy,
      https_proxy: proxy,
      all_proxy: proxy,
    }, sink.port)
    expect(sink.counts).toEqual({ requests: 0, connections: 0 })
    await closeSink(sink)
  }, 60_000)

  it('a poisoned child cannot reach any host other than the sink', async () => {
    // Harness control: proves the poison is active in the CLI's process, so
    // the two tests above are not passing merely because nothing dials.
    const out = execFileSync(process.execPath, [
      '--require',
      path.join(dir, 'poison.cjs'),
      '-e',
      `const net = require('node:net'); try { net.connect(80, 'example.com'); console.log('DIALLED') } catch (error) { console.log(error.message) }`,
    ], { encoding: 'utf-8', env: { ...process.env, MD_WEB_CLI_SINK_PORT: '' } })
    expect(out).toContain('NETWORK BLOCKED')
    expect(out).not.toContain('DIALLED')
  }, 30_000)
})
