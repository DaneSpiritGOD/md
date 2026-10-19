import type { FlagOverrides, RawStyleConfig } from './config'
/**
 * CLI entry for @dane.dai/md-web-cli.
 *
 * Ticket 03 contract: `render <in.md> -o <out.html>` with site defaults.
 * Ticket 04: output is WeChat-ready (inlined styles, no <style> block, no
 * class attributes) and pending placeholders (mermaid/KaTeX/infographic/
 * unregistered languages) fail the run instead of being silently stripped.
 * Ticket 05: `--config` (Designer or MCP dialect JSON), `--raw` (pre-inlining
 * intermediate output) and flag overrides. Precedence: built-in defaults <
 * config file < CLI flags.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { applyFlagOverrides, normalizeStyleConfig } from './config'
import { renderMarkdownToStyledHtml } from './render'
import { PendingPlaceholderError, renderMarkdownToWeChatHtml } from './wechat'

interface ParsedArgs {
  input?: string
  output?: string
  config?: string
  raw?: boolean
  cssTab?: string
  flags: FlagOverrides
}

function printUsage(): void {
  process.stderr.write(`Usage: md-web-cli render <in.md> -o <out.html> [options]

Options:
  -o, --output <file>       Output HTML file (required)
  --config <file>           Style config JSON: Designer export (first-class)
                            or MCP render_markdown schema (alias)
  --css-tab <id|name>       Use the given CSS editor tab instead of the active one
  --raw                     Emit the pre-inlining intermediate form (with
                            <style> block) instead of WeChat-ready HTML
  --theme <name>            default | grace | simple
  --primary-color <color>   Primary accent color (hex)
  --font-family <stack>     Font family stack
  --font-size <size>        Base font size (e.g. 16px)
  --line-height <n>         Body line height (unitless, e.g. 1.75)
  --block-spacing <n>       Block spacing multiplier (e.g. 1)
  --link-color <color>      Link color
  --blockquote-background <value>  Blockquote background
  --body-color <color>      Body text color (default rgb(10,10,10))
  --legend <mode>           Image caption format
  --code-theme <name>       Code highlight theme (preset name or MCP URL)
  --theme-mode <mode>       light | dark
  --mac-code-block / --no-mac-code-block        macOS code block title bar
  --show-line-number / --no-show-line-number    Code block line numbers
  --cite-status / --no-cite-status              Footnote-style citations
  --count-status / --no-count-status            Reading time estimate
  --use-indent / --no-use-indent                Paragraph first-line indent
  --use-justify / --no-use-justify              Justified paragraph text
  -h, --help                Show this help
`)
}

function fail(message: string): never {
  process.stderr.write(`md-web-cli: ${message}\n`)
  process.exit(1)
}

/**
 * Consume the next argv token as the flag's explicit value only when it is a
 * boolean literal (`true`/`false`/`1`/`0`). A bare `--flag` means true; this
 * keeps a following positional input (or another flag) from being swallowed.
 */
function takeBool(argv: string[], i: number): { value: boolean, next: number } {
  const raw = argv[i + 1]
  if (raw === `true` || raw === `1`)
    return { value: true, next: i + 1 }
  if (raw === `false` || raw === `0`)
    return { value: false, next: i + 1 }
  return { value: true, next: i }
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { flags: {} }
  const flags = parsed.flags
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === `-o` || arg === `--output`) {
      parsed.output = argv[++i]
    }
    else if (arg.startsWith(`--output=`)) {
      parsed.output = arg.slice(`--output=`.length)
    }
    else if (arg === `--config`) {
      parsed.config = argv[++i]
    }
    else if (arg.startsWith(`--config=`)) {
      parsed.config = arg.slice(`--config=`.length)
    }
    else if (arg === `--raw`) {
      parsed.raw = true
    }
    else if (arg === `--css-tab`) {
      parsed.cssTab = argv[++i]
    }
    else if (arg.startsWith(`--css-tab=`)) {
      parsed.cssTab = arg.slice(`--css-tab=`.length)
    }
    else if (arg === `--body-color`) {
      flags.bodyColor = argv[++i]
    }
    else if (arg.startsWith(`--body-color=`)) {
      flags.bodyColor = arg.slice(`--body-color=`.length)
    }
    else if (arg === `--theme` || arg.startsWith(`--theme=`)) {
      const value = arg === `--theme` ? argv[++i] : arg.slice(`--theme=`.length)
      if (value === `default` || value === `grace` || value === `simple`)
        flags.theme = value
      else
        fail(`--theme must be one of: default, grace, simple`)
    }
    else if (arg === `--theme-mode` || arg.startsWith(`--theme-mode=`)) {
      const value = arg === `--theme-mode` ? argv[++i] : arg.slice(`--theme-mode=`.length)
      if (value === `light` || value === `dark`)
        flags.themeMode = value
      else
        fail(`--theme-mode must be light or dark`)
    }
    else if (arg === `--legend` || arg.startsWith(`--legend=`)) {
      const value = arg === `--legend` ? argv[++i] : arg.slice(`--legend=`.length)
      if ([`title-alt`, `alt-title`, `title`, `alt`, `filename`, `none`].includes(value))
        flags.legend = value as FlagOverrides['legend']
      else
        fail(`--legend must be one of: title-alt, alt-title, title, alt, filename, none`)
    }
    else if (arg === `--code-theme` || arg.startsWith(`--code-theme=`)) {
      flags.codeBlockTheme = arg === `--code-theme` ? argv[++i] : arg.slice(`--code-theme=`.length)
    }
    else if (arg === `--primary-color`) {
      flags.primaryColor = argv[++i]
    }
    else if (arg.startsWith(`--primary-color=`)) {
      flags.primaryColor = arg.slice(`--primary-color=`.length)
    }
    else if (arg === `--font-family`) {
      flags.fontFamily = argv[++i]
    }
    else if (arg.startsWith(`--font-family=`)) {
      flags.fontFamily = arg.slice(`--font-family=`.length)
    }
    else if (arg === `--font-size`) {
      flags.fontSize = argv[++i]
    }
    else if (arg.startsWith(`--font-size=`)) {
      flags.fontSize = arg.slice(`--font-size=`.length)
    }
    else if (arg === `--line-height`) {
      flags.lineHeight = argv[++i]
    }
    else if (arg.startsWith(`--line-height=`)) {
      flags.lineHeight = arg.slice(`--line-height=`.length)
    }
    else if (arg === `--block-spacing`) {
      flags.blockSpacing = argv[++i]
    }
    else if (arg.startsWith(`--block-spacing=`)) {
      flags.blockSpacing = arg.slice(`--block-spacing=`.length)
    }
    else if (arg === `--link-color`) {
      flags.linkColor = argv[++i]
    }
    else if (arg.startsWith(`--link-color=`)) {
      flags.linkColor = arg.slice(`--link-color=`.length)
    }
    else if (arg === `--blockquote-background`) {
      flags.blockquoteBackground = argv[++i]
    }
    else if (arg.startsWith(`--blockquote-background=`)) {
      flags.blockquoteBackground = arg.slice(`--blockquote-background=`.length)
    }
    else if (arg === `--mac-code-block`) {
      const taken = takeBool(argv, i)
      flags.isMacCodeBlock = taken.value
      i = taken.next
    }
    else if (arg === `--no-mac-code-block`) {
      flags.isMacCodeBlock = false
    }
    else if (arg === `--show-line-number`) {
      const taken = takeBool(argv, i)
      flags.isShowLineNumber = taken.value
      i = taken.next
    }
    else if (arg === `--no-show-line-number`) {
      flags.isShowLineNumber = false
    }
    else if (arg === `--cite-status`) {
      const taken = takeBool(argv, i)
      flags.citeStatus = taken.value
      i = taken.next
    }
    else if (arg === `--no-cite-status`) {
      flags.citeStatus = false
    }
    else if (arg === `--count-status`) {
      const taken = takeBool(argv, i)
      flags.countStatus = taken.value
      i = taken.next
    }
    else if (arg === `--no-count-status`) {
      flags.countStatus = false
    }
    else if (arg === `--use-indent`) {
      const taken = takeBool(argv, i)
      flags.isUseIndent = taken.value
      i = taken.next
    }
    else if (arg === `--no-use-indent`) {
      flags.isUseIndent = false
    }
    else if (arg === `--use-justify`) {
      const taken = takeBool(argv, i)
      flags.isUseJustify = taken.value
      i = taken.next
    }
    else if (arg === `--no-use-justify`) {
      flags.isUseJustify = false
    }
    else if (arg === `-h` || arg === `--help`) {
      printUsage()
      process.exit(0)
    }
    else if (!arg.startsWith(`-`)) {
      parsed.input = arg
    }
    else {
      fail(`Unknown option "${arg}". See --help.`)
    }
  }
  return parsed
}

function loadConfigFile(configPath: string, cssTab?: string): FlagOverrides & RawStyleConfig {
  const resolved = path.resolve(configPath)
  if (!fs.existsSync(resolved))
    fail(`Config file not found: ${resolved}`)
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(fs.readFileSync(resolved, `utf-8`))
  }
  catch (error) {
    fail(`Config file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (typeof parsedJson !== `object` || parsedJson === null || Array.isArray(parsedJson))
    fail(`Config file must contain a JSON object`)

  return normalizeStyleConfig(parsedJson as RawStyleConfig, { cssTab }) as FlagOverrides & RawStyleConfig
}

function runRender(argv: string[]): void {
  const parsed = parseArgs(argv)
  const { input, output } = parsed
  if (!input)
    fail(`render requires an input Markdown file. Usage: md-web-cli render <in.md> -o <out.html>`)
  if (!output)
    fail(`render requires an output path via -o <out.html>`)

  const inputPath = path.resolve(input)
  const outputPath = path.resolve(output)

  if (!fs.existsSync(inputPath))
    fail(`Input file not found: ${inputPath}`)
  if (!fs.statSync(inputPath).isFile())
    fail(`Input path is not a file: ${inputPath}`)
  if (path.dirname(outputPath) !== outputPath && !fs.existsSync(path.dirname(outputPath)))
    fail(`Output directory does not exist: ${path.dirname(outputPath)}`)

  // Precedence: built-in defaults < config file < CLI flags.
  const configFromFile = parsed.config ? loadConfigFile(parsed.config, parsed.cssTab) : {}
  const config = applyFlagOverrides(configFromFile, parsed.flags)

  const markdown = fs.readFileSync(inputPath, `utf-8`)

  let result
  try {
    result = parsed.raw
      ? renderMarkdownToStyledHtml(markdown, config)
      : renderMarkdownToWeChatHtml(markdown, config)
  }
  catch (error) {
    if (error instanceof PendingPlaceholderError) {
      process.stderr.write(`md-web-cli: render failed — ${error.message}\n`)
      for (const placeholder of error.placeholders) {
        process.stderr.write(`  - ${placeholder.kind}: ${placeholder.detail}\n`)
      }
      process.exit(1)
    }
    fail(error instanceof Error ? error.message : String(error))
  }

  fs.writeFileSync(outputPath, result.html, `utf-8`)
  process.stdout.write(`Rendered ${inputPath} -> ${outputPath}\n`)
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2)
  if (!command || command === `-h` || command === `--help`) {
    printUsage()
    process.exit(command ? 0 : 1)
  }
  if (command === `render`) {
    runRender(rest)
    return
  }
  fail(`Unknown command "${command}". Available commands: render`)
}

main()
