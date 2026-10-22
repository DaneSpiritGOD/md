/**
 * Strict comparator for the verify gate.
 *
 * Two rendered outputs are equal only when they are byte-identical. There is no
 * tolerance, no allow-list, and no expiry mechanism here by design: a tolerance
 * cannot tell "same rendering" from "similar number", which is how a line-height
 * change from 1.75 to 1.8 used to pass a gate.
 *
 * The diff below is reporting, never comparison: it explains a failure that the
 * byte comparison has already decided.
 */

const CONTEXT_LINES = 3
const MAX_LCS_LINES = 4000

/**
 * Split HTML into one tag or text run per line. The outputs are HTML with few
 * newlines, so line-diffing the raw text would collapse every difference into a
 * handful of unreadable hunks.
 */
export function explodeHtml(html) {
  return html.replace(/></g, `>\n<`).split(`\n`)
}

function diffSequences(a, b) {
  const n = a.length
  const m = b.length
  if (n === 0)
    return b.map((_, index) => ({ type: `insert`, bIndex: index }))
  if (m === 0)
    return a.map((_, index) => ({ type: `delete`, aIndex: index }))
  // Identical inputs are the common case (and the only passing one).
  if (a.join(`\n`) === b.join(`\n`))
    return a.map((_, index) => ({ type: `equal`, aIndex: index, bIndex: index }))

  let prefix = 0
  while (prefix < n && prefix < m && a[prefix] === b[prefix])
    prefix += 1
  let suffix = 0
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix])
    suffix += 1

  const ops = []
  for (let index = 0; index < prefix; index++)
    ops.push({ type: `equal`, aIndex: index, bIndex: index })

  const midA = a.slice(prefix, n - suffix)
  const midB = b.slice(prefix, m - suffix)
  const p = midA.length
  const q = midB.length

  // Above the cap the diff degrades to "the whole middle changed"; the verdict
  // (byte equality) never depends on this.
  if (p * q > MAX_LCS_LINES * MAX_LCS_LINES) {
    for (let index = 0; index < p; index++)
      ops.push({ type: `delete`, aIndex: prefix + index })
    for (let index = 0; index < q; index++)
      ops.push({ type: `insert`, bIndex: prefix + index })
  }
  else {
    const width = q + 1
    const lcs = new Uint32Array((p + 1) * width)
    for (let i = p - 1; i >= 0; i--) {
      for (let j = q - 1; j >= 0; j--) {
        lcs[i * width + j] = midA[i] === midB[j]
          ? lcs[(i + 1) * width + (j + 1)] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + (j + 1)])
      }
    }
    let i = 0
    let j = 0
    while (i < p && j < q) {
      if (midA[i] === midB[j]) {
        ops.push({ type: `equal`, aIndex: prefix + i, bIndex: prefix + j })
        i += 1
        j += 1
      }
      else if (lcs[(i + 1) * width + j] >= lcs[i * width + (j + 1)]) {
        ops.push({ type: `delete`, aIndex: prefix + i })
        i += 1
      }
      else {
        ops.push({ type: `insert`, bIndex: prefix + j })
        j += 1
      }
    }
    while (i < p) {
      ops.push({ type: `delete`, aIndex: prefix + i })
      i += 1
    }
    while (j < q) {
      ops.push({ type: `insert`, bIndex: prefix + j })
      j += 1
    }
  }

  for (let index = 0; index < suffix; index++)
    ops.push({ type: `equal`, aIndex: n - suffix + index, bIndex: m - suffix + index })

  return ops
}

function groupHunks(ops) {
  const hunks = []
  let current = null
  for (let index = 0; index < ops.length; index++) {
    const op = ops[index]
    if (op.type === `equal`) {
      if (current)
        current.trailingEqual += 1
      continue
    }
    if (current && current.trailingEqual <= CONTEXT_LINES * 2) {
      current.ops.push(op)
      current.endIndex = index
      current.trailingEqual = 0
      continue
    }
    current = { ops: [op], startIndex: index, endIndex: index, trailingEqual: 0 }
    hunks.push(current)
  }
  return hunks
}

function parseAttributes(line) {
  // Exploded lines can carry the original document's indentation.
  const trimmed = line.trimStart()
  if (!trimmed.startsWith(`<`))
    return null
  const end = trimmed.lastIndexOf(`>`)
  if (end < 0)
    return null
  const tagMatch = trimmed.match(/^<([\w-]+)/)
  if (!tagMatch)
    return null
  const source = trimmed.slice(0, end)
  const attrs = new Map()
  for (const match of source.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g))
    attrs.set(match[1], match[2])
  return { tag: tagMatch[1], attrs }
}

function parseStyleDeclarations(value) {
  const declarations = new Map()
  for (const part of value.split(`;`)) {
    const colon = part.indexOf(`:`)
    if (colon < 0)
      continue
    const property = part.slice(0, colon).trim()
    const propertyValue = part.slice(colon + 1).trim()
    if (property)
      declarations.set(property, propertyValue)
  }
  return declarations
}

/**
 * Classify what actually differs between one removed and one added line.
 *
 * Classes are derived mechanically from the two lines — attribute presence,
 * style-property value, text, element name — so a summary can say whether a
 * failure is the class-attribute difference or a real style drift without any
 * allow-list deciding the verdict.
 */
export function classifyLinePair(removed, added) {
  const classes = new Set()
  if (removed === undefined) {
    classes.add(`structure`)
    return [...classes]
  }
  if (added === undefined) {
    classes.add(`structure`)
    return [...classes]
  }

  const before = parseAttributes(removed)
  const after = parseAttributes(added)
  if (!before || !after) {
    // A text run that carries inline markup: compare the tag-stripped text and
    // the class-attribute count, which is what the CLI's class stripping moves.
    const classCount = value => (value.match(/\sclass\s*=/g) ?? []).length
    if (classCount(removed) !== classCount(added))
      classes.add(`attribute:class`)
    const stripTags = value => value.replace(/<[^>]*>/g, ``)
    if (stripTags(removed) !== stripTags(added))
      classes.add(`text`)
    if (classes.size === 0)
      classes.add(`text`)
    return [...classes]
  }
  if (before.tag !== after.tag) {
    classes.add(`element`)
    return [...classes]
  }

  for (const [name, value] of before.attrs) {
    if (!after.attrs.has(name)) {
      classes.add(`attribute:${name}`)
      continue
    }
    const other = after.attrs.get(name)
    if (other === value)
      continue
    if (name === `style`) {
      const a = parseStyleDeclarations(value)
      const b = parseStyleDeclarations(other)
      for (const [property, propertyValue] of a) {
        if (b.get(property) !== propertyValue)
          classes.add(`style:${property}`)
      }
      for (const property of b.keys()) {
        if (!a.has(property))
          classes.add(`style:${property}`)
      }
    }
    else {
      classes.add(`attribute:${name}`)
    }
  }
  for (const name of after.attrs.keys()) {
    if (!before.attrs.has(name))
      classes.add(`attribute:${name}`)
  }

  return [...classes]
}

function lineNumbers(values) {
  return values.map(value => value + 1)
}

/**
 * Pair removed and added lines inside a hunk by element name first, then by
 * position. Plain index pairing misattributes classes whenever one side has an
 * extra element (an inserted `<svg>` shifts every following pair).
 */
function pairLines(removed, added) {
  const used = new Set()
  const pairs = []
  const tagOf = line => parseAttributes(line)?.tag ?? null
  for (const line of removed) {
    const tag = tagOf(line)
    const match = added.findIndex((candidate, index) => !used.has(index) && tagOf(candidate) === tag)
    if (match >= 0) {
      used.add(match)
      pairs.push([line, added[match]])
    }
    else {
      pairs.push([line, undefined])
    }
  }
  added.forEach((line, index) => {
    if (!used.has(index))
      pairs.push([undefined, line])
  })
  return pairs
}

function summarize(hunks, aLines, bLines) {
  const classes = new Map()
  for (const hunk of hunks) {
    const removed = hunk.ops.filter(op => op.type === `delete`).map(op => aLines[op.aIndex])
    const added = hunk.ops.filter(op => op.type === `insert`).map(op => bLines[op.bIndex])
    const hunkClasses = new Set()
    for (const [before, after] of pairLines(removed, added))
      for (const name of classifyLinePair(before, after))
        hunkClasses.add(name)
    if (hunkClasses.size === 0)
      hunkClasses.add(`unclassified`)

    const location = hunk.ops[0].aIndex ?? hunk.ops[0].bIndex
    hunk.classes = [...hunkClasses].sort()
    for (const name of hunk.classes) {
      if (!classes.has(name))
        classes.set(name, [])
      classes.get(name).push(location + 1)
    }
  }
  return classes
}

function formatUnifiedDiff(hunks, ops, aLines, bLines) {
  const lines = []
  for (const hunk of hunks) {
    // Attach leading/trailing context for a standard unified view.
    const start = Math.max(0, hunk.startIndex - CONTEXT_LINES)
    const end = Math.min(ops.length - 1, hunk.endIndex + CONTEXT_LINES)
    const slice = ops.slice(start, end + 1)

    const aStart = slice.find(op => op.aIndex !== undefined)?.aIndex ?? 0
    const bStart = slice.find(op => op.bIndex !== undefined)?.bIndex ?? 0
    const aCount = slice.filter(op => op.type !== `insert`).length
    const bCount = slice.filter(op => op.type !== `delete`).length
    const header = `@@ -${aStart + 1},${aCount} +${bStart + 1},${bCount} @@ [${hunk.classes.join(`, `)}]`

    const body = slice.map((op) => {
      if (op.type === `equal`)
        return ` ${aLines[op.aIndex]}`
      if (op.type === `delete`)
        return `-${aLines[op.aIndex]}`
      return `+${bLines[op.bIndex]}`
    })
    lines.push(header, ...body)
  }
  return lines.join(`\n`)
}

/**
 * Compare two outputs byte for byte.
 *
 * @returns {{equal: boolean, hunkCount: number, classes: Array<{name: string, locations: number[]}>, unifiedDiff: string, firstDifference: number}}
 */
export function compareOutputs(oracleHtml, cliHtml) {
  if (oracleHtml === cliHtml) {
    return { equal: true, hunkCount: 0, classes: [], unifiedDiff: ``, firstDifference: -1 }
  }

  const aLines = explodeHtml(oracleHtml)
  const bLines = explodeHtml(cliHtml)
  const ops = diffSequences(aLines, bLines)
  const hunks = groupHunks(ops)
  const classMap = summarize(hunks, aLines, bLines)

  const classes = [...classMap.entries()]
    .map(([name, locations]) => ({ name, locations: lineNumbers(locations) }))
    .sort((a, b) => b.locations.length - a.locations.length || a.name.localeCompare(b.name))

  // Byte offset of the first character that differs, for a one-line pointer
  // when a caller only needs to know where the outputs part ways.
  let firstDifference = 0
  while (firstDifference < oracleHtml.length && oracleHtml[firstDifference] === cliHtml[firstDifference])
    firstDifference += 1

  return {
    equal: false,
    hunkCount: hunks.length,
    classes,
    unifiedDiff: formatUnifiedDiff(hunks, ops, aLines, bLines),
    firstDifference,
  }
}
