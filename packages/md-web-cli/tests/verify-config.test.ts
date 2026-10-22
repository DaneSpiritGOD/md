import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runVerify } from './helpers/run-verify'

/**
 * Config projection at the verify process seam.
 *
 * This case needs the browser (it runs the whole gate), so it is opt-in:
 * `MD_WEB_CLI_BROWSER_TESTS=1 pnpm --filter @dane.dai/md-web-cli test`.
 * It stays at the process boundary on purpose — a unit test of the projection
 * function would be a third seam, and the behaviour that matters is "the gate
 * never compares an article carried in the export".
 */

const browserTests = Boolean(process.env.MD_WEB_CLI_BROWSER_TESTS)

const ARTICLE_MARKER = `ARTICLE MARKER: this article must never be rendered`

describe.skipIf(!browserTests)(`verify command: Designer config`, () => {
  it(`compares the fixture, never the article carried in the export`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `verify-config-seam-`))
    try {
      const configPath = path.join(dir, `export.json`)
      const outDir = path.join(dir, `artifacts`)
      fs.writeFileSync(configPath, JSON.stringify({
        // Article content: must be dropped before either side sees the config.
        posts: [{ id: `post-1`, content: `# ${ARTICLE_MARKER}` }],
        currentPostId: `post-1`,
        currentPostIndex: 0,
        titleList: [ARTICLE_MARKER],
        readingTime: { words: 9999, minutes: 42 },
        // Pure UI: no effect on the rendered article.
        isDark: true,
        isOpenRightSlider: false,
        isOpenPostSlider: true,
        showAIToolbox: false,
        isShowCssEditor: true,
        isShowTableEditDialog: true,
        isShowUploadImgDialog: true,
        aiDialogVisible: true,
        aiImageDialogVisible: true,
        // Render-affecting: reach both sides.
        theme: `default`,
        primaryColor: `#0F4C81`,
        fontFamily: `-apple-system-font,BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB , Microsoft YaHei UI , Microsoft YaHei ,Arial,sans-serif`,
        fontSize: `16px`,
        codeBlockTheme: `https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/npm/highlightjs/11.11.1/styles/github-dark.min.css`,
        legend: `alt`,
        isMacCodeBlock: true,
        isShowLineNumber: false,
        isCiteStatus: false,
        isCountStatus: false,
        isUseIndent: false,
        isUseJustify: false,
        cssContentConfig: { active: `default`, tabs: [{ id: `default`, title: `default`, name: `default`, content: `` }] },
      }), `utf-8`)

      const { stdout, stderr } = runVerify([`--fixture`, `minimal`, `--config`, configPath, `--out-dir`, outDir], 240_000)
      const combined = `${stdout}${stderr}`

      expect(combined).toContain(`article-content`)
      expect(combined).toContain(`the same projected file goes to both sides`)

      const cliHtml = fs.readFileSync(path.join(outDir, `minimal`, `cli.html`), `utf-8`)
      const oracleHtml = fs.readFileSync(path.join(outDir, `minimal`, `oracle.html`), `utf-8`)
      for (const html of [cliHtml, oracleHtml]) {
        expect(html).toContain(`Minimal fixture`)
        expect(html).not.toContain(ARTICLE_MARKER)
      }
    }
    finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 240_000)
})
