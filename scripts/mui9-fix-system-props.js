/**
 * One-shot codemod for MUI 9 upgrade in kasrut-map.
 * Converts removed system-shortcut props on Typography/Stack/Box
 * (fontWeight, flexWrap, gap, mb, minWidth, textAlign) into entries
 * inside the `sx` prop. Idempotent.
 *
 * Run: node scripts/mui9-fix-system-props.js
 */

const fs = require('node:fs')
const path = require('node:path')

const TARGET = process.argv[2] || 'kasrut-map'
const ROOT = path.resolve(__dirname, '..', TARGET, 'src')
const SYSTEM_PROPS = ['fontWeight', 'flexWrap', 'gap', 'mb', 'minWidth', 'textAlign']

const COMPONENT_TAGS = ['Typography', 'Stack', 'Box']

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (/\.tsx?$/.test(entry.name)) files.push(full)
  }
  return files
}

// Find balanced JSX opening tag starting at <Tag and ending at > or />
function findOpeningTag(src, tagName, fromIndex = 0) {
  const re = new RegExp(`<${tagName}\\b`, 'g')
  re.lastIndex = fromIndex
  const m = re.exec(src)
  if (!m) return null
  let i = m.index + m[0].length
  let depth = 0
  let inStr = null   // '"' or "'" or '`'
  let inExpr = 0     // {  } depth
  while (i < src.length) {
    const c = src[i]
    if (inStr) {
      if (c === '\\') { i += 2; continue }
      if (c === inStr) inStr = null
      i++
      continue
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; i++; continue }
    if (c === '{') { inExpr++; i++; continue }
    if (c === '}') { inExpr--; i++; continue }
    if (inExpr > 0) { i++; continue }
    if (c === '<') depth++
    if (c === '>') {
      if (depth === 0) return { start: m.index, end: i + 1, head: m[0] }
      depth--
    }
    i++
  }
  return null
}

// Extract attributes from an opening-tag string like `<Typography variant="x" fontWeight={700}>`
function parseAttrs(tag) {
  // Strip leading <Tag and trailing > or />
  const headMatch = tag.match(/^<\w+\b/)
  if (!headMatch) return null
  const head = headMatch[0]
  let body = tag.slice(head.length, tag.endsWith('/>') ? -2 : -1).trim()
  const tail = tag.endsWith('/>') ? ' />' : '>'
  // Tokenize attributes: name={...}  or name="..."  or name='...'  or name (boolean)
  const attrs = []
  let i = 0
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++
    if (i >= body.length) break
    const nameMatch = body.slice(i).match(/^[A-Za-z_][A-Za-z0-9_-]*/)
    if (!nameMatch) { i++; continue }
    const name = nameMatch[0]
    i += name.length
    // Whitespace
    while (i < body.length && /\s/.test(body[i])) i++
    if (body[i] !== '=') {
      attrs.push({ name, raw: name, kind: 'bool' })
      continue
    }
    i++ // skip =
    while (i < body.length && /\s/.test(body[i])) i++
    if (body[i] === '{') {
      // balanced expression
      let depth = 1, j = i + 1, inStr = null
      while (j < body.length && depth > 0) {
        const c = body[j]
        if (inStr) {
          if (c === '\\') { j += 2; continue }
          if (c === inStr) inStr = null
          j++; continue
        }
        if (c === '"' || c === "'" || c === '`') inStr = c
        else if (c === '{') depth++
        else if (c === '}') depth--
        j++
      }
      const value = body.slice(i + 1, j - 1) // inside { }
      attrs.push({ name, raw: `${name}={${value}}`, kind: 'expr', value })
      i = j
    } else if (body[i] === '"' || body[i] === "'") {
      const q = body[i]
      let j = i + 1
      while (j < body.length && body[j] !== q) {
        if (body[j] === '\\') j += 2
        else j++
      }
      const value = body.slice(i + 1, j)
      attrs.push({ name, raw: `${name}=${q}${value}${q}`, kind: 'string', value })
      i = j + 1
    } else {
      // bare value (rare)
      const m = body.slice(i).match(/^\S+/)
      attrs.push({ name, raw: `${name}=${m ? m[0] : ''}`, kind: 'bare' })
      i += m ? m[0].length : 0
    }
  }
  return { head, attrs, tail }
}

function attrToSxEntry(attr) {
  if (attr.kind === 'expr') return `${attr.name}: ${attr.value.trim()}`
  if (attr.kind === 'string') return `${attr.name}: '${attr.value}'`
  return null
}

function rebuildTag({ head, attrs, tail }) {
  const out = [head]
  for (const a of attrs) out.push(' ' + a.raw)
  return out.join('') + tail
}

function transformTag(tag) {
  const parsed = parseAttrs(tag)
  if (!parsed) return tag
  const { attrs } = parsed
  const moved = []
  let sxAttr = attrs.find(a => a.name === 'sx')
  const remaining = attrs.filter(a => {
    if (SYSTEM_PROPS.includes(a.name)) {
      const e = attrToSxEntry(a)
      if (e) moved.push(e)
      return false
    }
    return true
  })
  if (moved.length === 0) return tag

  if (sxAttr) {
    // Inject into existing sx={{ ... }} expression
    const v = (sxAttr.value || '').trim()
    if (v.startsWith('{') && v.endsWith('}')) {
      const inner = v.slice(1, -1).trim().replace(/,$/, '')
      const merged = inner.length ? `${inner}, ${moved.join(', ')}` : moved.join(', ')
      sxAttr.value = `{ ${merged} }`
      sxAttr.raw = `sx={${sxAttr.value}}`
    } else {
      // Spread of unknown shape — append a separate sx fragment via spread (best-effort)
      sxAttr.raw = `sx={{ ...(${v}), ${moved.join(', ')} }}`
    }
  } else {
    remaining.push({ name: 'sx', kind: 'expr', value: `{ ${moved.join(', ')} }`,
      raw: `sx={{ ${moved.join(', ')} }}` })
  }
  return rebuildTag({ ...parsed, attrs: remaining })
}

function transformFile(src) {
  let out = src
  for (const tag of COMPONENT_TAGS) {
    let cursor = 0
    while (true) {
      const m = findOpeningTag(out, tag, cursor)
      if (!m) break
      const original = out.slice(m.start, m.end)
      const updated = transformTag(original)
      if (updated !== original) {
        out = out.slice(0, m.start) + updated + out.slice(m.end)
        cursor = m.start + updated.length
      } else {
        cursor = m.end
      }
    }
  }
  return out
}

const files = walk(ROOT)
let changed = 0
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const out = transformFile(src)
  if (out !== src) {
    fs.writeFileSync(f, out)
    changed++
    console.log('updated', path.relative(process.cwd(), f))
  }
}
console.log(`Done. ${changed} files changed.`)
