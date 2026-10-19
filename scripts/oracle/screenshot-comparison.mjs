/**
 * Side-by-side comparison screenshots for Tier 1 acceptance (ticket 07).
 *
 * Renders the Oracle HTML and the CLI output HTML in headless Chromium at a
 * phone-ish width and saves a full-page screenshot of each, plus a combined
 * side-by-side composite for the evidence folder.
 *
 * Run from the repo root: node scripts/oracle/screenshot-comparison.mjs
 */

import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = resolve(process.cwd(), 'docs/evidence/md-web-cli-tier1')
const ORACLE_HTML = resolve(BASE, 'oracle.html')
const CLI_HTML = resolve(BASE, 'cli-output.html')

// playwright 1.64 wants chromium_headless_shell-1248, which is not installed
// here; the machine has the 1237 Chrome-for-Testing build from ticket 06's
// Oracle run, so fall back to it when the default launch fails.
const FALLBACK_EXECUTABLE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1237/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`

async function launch() {
  try {
    return await chromium.launch()
  }
  catch (error) {
    if (!existsSync(FALLBACK_EXECUTABLE))
      throw error
    return chromium.launch({ executablePath: FALLBACK_EXECUTABLE })
  }
}

async function capture(browser, htmlPath, outPath) {
  const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(`file://${htmlPath}`)
  await page.addStyleTag({ content: 'body{margin:16px;background:#fff;}' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: outPath, fullPage: true })
  await page.close()
  console.log(`captured ${outPath}`)
}

mkdirSync(BASE, { recursive: true })
const browser = await launch()
await capture(browser, ORACLE_HTML, resolve(BASE, 'screenshot-oracle.png'))
await capture(browser, CLI_HTML, resolve(BASE, 'screenshot-cli.png'))

// Composite: both pages side by side on one canvas.
const compositePage = await browser.newPage({ viewport: { width: 920, height: 900 }, deviceScaleFactor: 2 })
await compositePage.setContent(`
  <body style="margin:0;display:flex;background:#eee;">
    <iframe src="file://${ORACLE_HTML}" style="width:50%;height:100vh;border:0;"></iframe>
    <iframe src="file://${CLI_HTML}" style="width:50%;height:100vh;border:0;"></iframe>
  </body>
`)
await compositePage.waitForTimeout(500)
await compositePage.screenshot({ path: resolve(BASE, 'screenshot-side-by-side.png') })
await compositePage.close()
await browser.close()
console.log('done')
