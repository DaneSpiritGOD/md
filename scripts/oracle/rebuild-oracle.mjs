/**
 * Tier 3 Oracle rebuild (ticket 06, workflow_dispatch-facing — not part of the
 * CLI bundle).
 *
 * Builds nothing itself: run `pnpm --filter @md/web build:only` first (the
 * GitHub workflow and ORACLE.md document this). This script then:
 *
 *   1. serves apps/web/dist over a local static server (the fork's own build,
 *      never the live site);
 *   2. drives Playwright Chromium to the built app;
 *   3. injects the ticket 02 fixture (`packages/md-web-cli/fixtures/full.md`)
 *      through the app's own editor store and triggers the real WeChat copy
 *      pipeline (`processClipboardContent` via the header's copy flow);
 *   4. waits for the preview to settle using the app's own readiness signals
 *      (fixture markers present, async diagram placeholders gone, KaTeX
 *      resolved) plus HTML stability — not a fixed sleep;
 *   5. captures the processed clipboard HTML (exactly what WeChat would
 *      receive) plus a structural summary of that output;
 *   6. writes the Oracle atomically (temp file + rename) ONLY after every
 *      step succeeded. Any failure exits non-zero and leaves the previous
 *      Oracle untouched.
 *
 * Injection path (see ORACLE.md for rationale): the app exposes no test hook,
 * so we drive the DOM: click into the CodeMirror editor, keyboard select-all,
 * and insertText the fixture — CodeMirror routes that through its native
 * input pipeline, so the app's own debounced update listeners refresh the
 * preview and persist the post exactly as with human typing. The header's
 * WeChat copy button is then clicked to run the real copy flow, and the
 * clipboard HTML is read back via the browser clipboard API (permissions
 * granted through the Chromium launch context).
 */

import { Buffer } from 'node:buffer'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, `../..`)
const DIST_DIR = resolve(REPO_ROOT, `apps/web/dist`)
const FIXTURE_PATH = resolve(REPO_ROOT, `packages/md-web-cli/fixtures/full.md`)
const OUT_DIR = resolve(REPO_ROOT, `packages/md-web-cli/oracle`)
const OUT_PATH = join(OUT_DIR, `oracle.html`)
const REPORT_PATH = join(OUT_DIR, `oracle-report.json`)

const PAGE_URL = `http://127.0.0.1:${process.env.ORACLE_PORT ?? 4173}/md/`
const PREVIEW_TIMEOUT_MS = 60_000
const STABILITY_POLLS = 6
const NAV_TIMEOUT_MS = 60_000

function fail(message) {
  console.error(`\n[oracle] FAILED: ${message}\n`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Static server for the built app
// ---------------------------------------------------------------------------

const MIME = {
  '.html': `text/html; charset=utf-8`,
  '.js': `text/javascript; charset=utf-8`,
  '.mjs': `text/javascript; charset=utf-8`,
  '.css': `text/css; charset=utf-8`,
  '.json': `application/json`,
  '.png': `image/png`,
  '.jpg': `image/jpeg`,
  '.jpeg': `image/jpeg`,
  '.gif': `image/gif`,
  '.svg': `image/svg+xml`,
  '.ico': `image/x-icon`,
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}

function startStaticServer(rootDir, port) {
  return new Promise((resolvePromise, reject) => {
    const server = createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, `http://localhost`).pathname)
        // The build uses base `/md/`; strip the prefix before resolving.
        const relative = urlPath.replace(/^\/md\/?/, ``) || `index.html`
        const filePath = normalize(join(rootDir, relative))
        if (!filePath.startsWith(rootDir)) {
          res.writeHead(403)
          res.end(`forbidden`)
          return
        }
        const target = existsSync(filePath) && statSync(filePath).isFile()
          ? filePath
          : join(rootDir, `index.html`) // SPA fallback
        if (!existsSync(target)) {
          res.writeHead(404)
          res.end(`not found: ${urlPath}`)
          return
        }
        res.writeHead(200, { 'content-type': MIME[extname(target)] ?? `application/octet-stream` })
        createReadStream(target).pipe(res)
      }
      catch (error) {
        res.writeHead(500)
        res.end(`server error: ${error.message}`)
      }
    })
    server.on(`error`, reject)
    server.listen(port, `127.0.0.1`, () => resolvePromise(server))
  })
}

// ---------------------------------------------------------------------------
// Preview readiness: mirror the app's own waitForPreviewReady signals plus
// an HTML-stability window, so the capture never races async content.
// ---------------------------------------------------------------------------

async function waitForStablePreview(page) {
  // The editor mounts CodeMirror asynchronously; wait for the app shell.
  await page.waitForSelector(`#output`, { timeout: NAV_TIMEOUT_MS })

  // The app renders the default example first; our injection must replace it.
  await page.waitForFunction(() => {
    const output = document.getElementById(`output`)
    return output && output.textContent.length > 0
  }, { timeout: NAV_TIMEOUT_MS })

  // Readiness gate: the fixture's characteristic h1 must be present, no
  // pending async placeholders, and the preview HTML must stop changing.
  const FIXTURE_MARKER = `Full-coverage fixture`
  const deadline = Date.now() + PREVIEW_TIMEOUT_MS
  let previousHtml = ``
  let stableCount = 0

  while (Date.now() < deadline) {
    const snapshot = await page.evaluate((marker) => {
      const output = document.getElementById(`output`)
      if (!output)
        return null
      return {
        htmlLength: output.innerHTML.length,
        signature: [
          output.innerHTML.length,
          output.querySelectorAll(`h1, h2, h3, h4, h5, h6`).length,
          output.querySelectorAll(`table`).length,
          output.querySelectorAll(`section`).length,
        ].join(`|`),
        markers: {
          heading2: !!output.querySelector(`h2`),
          table: output.querySelectorAll(`table`).length > 0,
          macSign: !!output.querySelector(`.mac-sign`),
          fixture: output.textContent.includes(marker),
          defaultContentGone: !output.textContent.includes(`探索 Markdown`),
        },
        pendingDiagram: !!output.querySelector(`[data-md-diagram-state="loading"]`),
        pendingMath: !!output.querySelector(`.katex-pending`),
      }
    }, FIXTURE_MARKER)

    const ready = snapshot
      && snapshot.markers.fixture
      && snapshot.markers.defaultContentGone
      && snapshot.markers.heading2
      && snapshot.markers.table
      && !snapshot.pendingDiagram
      && !snapshot.pendingMath
    if (ready) {
      if (snapshot.signature === previousHtml) {
        stableCount += 1
        if (stableCount >= STABILITY_POLLS) {
          return snapshot
        }
      }
      else {
        stableCount = 0
        previousHtml = snapshot.signature
      }
    }
    else {
      stableCount = 0
    }
    await new Promise(r => setTimeout(r, 250))
  }

  fail(`preview did not stabilize within ${PREVIEW_TIMEOUT_MS / 1000}s`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(DIST_DIR)) {
    fail(`apps/web/dist not found. Run \`pnpm --filter @md/web build\` first (see packages/md-web-cli/ORACLE.md).`)
  }
  if (!existsSync(FIXTURE_PATH)) {
    fail(`fixture not found: ${FIXTURE_PATH}`)
  }

  const fixture = await readFile(FIXTURE_PATH, `utf8`)
  const port = Number(process.env.ORACLE_PORT ?? 4173)
  const server = await startStaticServer(DIST_DIR, port)
  console.log(`[oracle] serving ${DIST_DIR} at ${PAGE_URL}`)

  let browser
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        `--headless=new`,
        `--disable-web-security`,
        `--allow-file-access-from-files`,
      ],
    })
    const context = await browser.newContext({
      viewport: { width: 1400, height: 1000 },
      permissions: [`clipboard-read`, `clipboard-write`],
      locale: `zh-CN`,
      baseURL: `http://127.0.0.1:${port}`,
    })
    // Force light theme (the copy flow re-renders for light anyway, but a dark
    // UI would change nothing user-visible in the WeChat output).
    await context.addInitScript(() => {
      try {
        localStorage.setItem(`vueuse-color-scheme`, `light`)
      }
      catch {}
    })
    const page = await context.newPage()
    page.setDefaultTimeout(NAV_TIMEOUT_MS)

    const consoleErrors = []
    page.on(`pageerror`, (error) => {
      consoleErrors.push(String(error))
    })

    console.log(`[oracle] loading ${PAGE_URL}`)
    await page.goto(PAGE_URL, { waitUntil: `domcontentloaded` })

    // Wait for the editor (CodeMirror) to exist.
    await page.waitForSelector(`.cm-editor`, { timeout: NAV_TIMEOUT_MS })
    await page.waitForSelector(`#output`, { timeout: NAV_TIMEOUT_MS })
    console.log(`[oracle] app loaded; injecting fixture via keyboard input`)

    // --- Inject the fixture through the app's own input handling ---------
    // CodeMirror manages its own DOM selection; synthetic DOM ranges are
    // ignored. Focus for real, then replace the document via keyboard
    // select-all + insertText, which CodeMirror handles through its native
    // input pipeline (its update listeners then refresh the preview and
    // persist the post exactly as with human typing).
    await page.click(`.cm-content`)
    await page.keyboard.press(`ControlOrMeta+A`)
    await page.keyboard.insertText(fixture)

    const previewSnapshot = await waitForStablePreview(page)
    console.log(`[oracle] preview rendered and stable; triggering WeChat copy`)

    // --- Trigger the real WeChat copy flow -------------------------------
    // Click the header copy button (公众号格式 / WeChat format). It runs
    // processClipboardContent() and writes text/html to the clipboard.
    const copyButton = page.locator(`header button:has-text("复制"), .header-container button:has-text("复制")`).first()
    if (await copyButton.count() === 0)
      fail(`WeChat copy button not found in header — has the header markup changed?`)
    await copyButton.click()

    // Wait for the copy success toast / button to stop spinning.
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll('button')]
      return buttons.some(button => button.textContent?.includes(`复制`))
        && !document.querySelector('[data-sonner-toast][data-type="loading"]')
    }, { timeout: 30_000 })
    await page.waitForTimeout(500)

    const clipboardHtml = await page.evaluate(async () => {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        if (item.types.includes(`text/html`)) {
          const blob = await item.getType(`text/html`)
          return await blob.text()
        }
      }
      return ``
    })

    if (!clipboardHtml)
      fail(`clipboard text/html is empty — the copy flow did not produce output`)

    // --- Structural summary of the WeChat output (for human cross-ref) ---
    // Parsed from the clipboard HTML (post-juice, inline styles) — the live
    // preview is class-based and would not show the inlined properties.
    const summary = await page.evaluate((html) => {
      const root = new DOMParser().parseFromString(html, `text/html`)
      const output = root.body
      const count = selector => output.querySelectorAll(selector).length
      const firstMatchStyle = (selector) => {
        const el = output.querySelector(selector)
        if (!el)
          return null
        const raw = el.getAttribute(`style`) ?? ``
        const grab = (prop) => {
          const match = raw.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, `i`))
          return match ? match[1].trim() : null
        }
        return {
          background: grab(`background`) ?? grab(`background-color`),
          fontSize: grab(`font-size`),
          textAlign: grab(`text-align`),
          borderLeft: grab(`border-left`),
          color: grab(`color`),
        }
      }
      return {
        counts: {
          h1: count(`h1`),
          h2: count(`h2`),
          h3: count(`h3`),
          h4: count(`h4`),
          h5: count(`h5`),
          h6: count(`h6`),
          p: count(`p`),
          table: count(`table`),
          blockquote: count(`blockquote`),
          pre: count(`pre`),
          ul: count(`ul`),
          ol: count(`ol`),
          li: count(`li`),
          img: count(`img`),
          hr: count(`hr`),
          section: count(`section`),
          strong: count(`strong`),
          span_macSign: count(`span.mac-sign`),
        },
        keyStyles: {
          h2: firstMatchStyle(`h2`),
          blockquote: firstMatchStyle(`blockquote`),
          strong: firstMatchStyle(`strong`),
          sectionRoot: firstMatchStyle(`section`),
        },
        hasStyleTag: !!root.querySelector(`style`),
        // Expected true: class stripping is the CLI's WeChat wrapper step,
        // not part of the browser copy flow — ticket 07 must account for it.
        hasClassAttributes: /\sclass\s*=\s*["']/.test(html),
      }
    }, clipboardHtml)

    // --- Atomic write: temp + rename, only on full success ---------------
    await mkdir(OUT_DIR, { recursive: true })
    const wrapped = `<!-- Browser Oracle (WeChat copy flow output) — generated by scripts/oracle/rebuild-oracle.mjs. Do not edit by hand. -->\n${clipboardHtml}\n`
    const tmpOracle = `${OUT_PATH}.tmp`
    const tmpReport = `${REPORT_PATH}.tmp`
    await writeFile(tmpOracle, wrapped, `utf8`)
    await writeFile(tmpReport, JSON.stringify({
      generatedAt: new Date().toISOString(),
      pageUrl: PAGE_URL,
      fixturePath: `packages/md-web-cli/fixtures/full.md`,
      fixtureBytes: Buffer.byteLength(fixture, `utf8`),
      oracleBytes: Buffer.byteLength(wrapped, `utf8`),
      preview: previewSnapshot,
      summary,
      consoleErrors,
    }, null, 2), `utf8`)
    await rename(tmpOracle, OUT_PATH)
    await rename(tmpReport, REPORT_PATH)

    console.log(`[oracle] wrote ${OUT_PATH} (${Buffer.byteLength(wrapped)} bytes)`)
    console.log(`[oracle] wrote ${REPORT_PATH}`)
    if (consoleErrors.length > 0)
      console.warn(`[oracle] note: ${consoleErrors.length} page error(s) recorded in the report`)
  }
  finally {
    if (browser)
      await browser.close().catch(() => {})
    server.close()
    await rm(`${OUT_PATH}.tmp`, { force: true })
    await rm(`${REPORT_PATH}.tmp`, { force: true })
  }
}

main().catch((error) => {
  fail(error?.stack ?? error?.message ?? String(error))
})
