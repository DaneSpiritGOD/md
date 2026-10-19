/**
 * CLI entry for @dane.dai/md-web-cli.
 *
 * Ticket 03 contract: `render <in.md> -o <out.html>` with site defaults.
 * Ticket 04: output is WeChat-ready (inlined styles, no <style> block, no
 * class attributes) and pending placeholders (mermaid/KaTeX/infographic/
 * unregistered languages) fail the run instead of being silently stripped.
 * Structured so ticket 05 can add --config / --raw / --body-color etc.
 * without reshaping the command dispatch.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { PendingPlaceholderError, renderMarkdownToWeChatHtml } from './wechat'

interface ParsedArgs {
  input?: string
  output?: string
}

function printUsage(): void {
  process.stderr.write(`Usage: md-web-cli render <in.md> -o <out.html>\n`)
}

function fail(message: string): never {
  process.stderr.write(`md-web-cli: ${message}\n`)
  process.exit(1)
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === `-o` || arg === `--output`) {
      parsed.output = argv[++i]
    }
    else if (arg.startsWith(`--output=`)) {
      parsed.output = arg.slice(`--output=`.length)
    }
    else if (arg === `-h` || arg === `--help`) {
      printUsage()
      process.exit(0)
    }
    else if (!arg.startsWith(`-`)) {
      parsed.input = arg
    }
  }
  return parsed
}

function runRender(argv: string[]): void {
  const { input, output } = parseArgs(argv)
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

  const markdown = fs.readFileSync(inputPath, `utf-8`)

  let result
  try {
    result = renderMarkdownToWeChatHtml(markdown)
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
