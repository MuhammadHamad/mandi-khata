/**
 * `npm run check:i18n`: every phrase the app passes to t() has Roman Urdu in
 * src/lib/ur.ts, with the same {placeholders}, and the dictionary keeps no
 * phrase the app no longer uses.
 *
 * Phrases must be written straight into the call, t('…') or t("…"), so this
 * can find them; a phrase built from pieces would be missed.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { UR } from '../src/lib/ur'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

const CALL = /\bt\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
const used = new Map<string, string>()
const problems: string[] = []

for (const file of sourceFiles('src')) {
  if (file === join('src', 'lib', 'ur.ts')) continue
  for (const match of readFileSync(file, 'utf8').matchAll(CALL)) {
    const [, quote, raw] = match
    if (quote === '`' && raw.includes('${')) {
      problems.push(`${file}: a phrase built with \${…}; use {placeholders} instead`)
      continue
    }
    const phrase = raw.replace(/\\(.)/g, '$1')
    if (!used.has(phrase)) used.set(phrase, file)
  }
}

const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(', ')

for (const [phrase, file] of used) {
  if (!(phrase in UR)) problems.push(`no Roman Urdu for ${JSON.stringify(phrase)} (${file})`)
  else if (holes(phrase) !== holes(UR[phrase])) {
    problems.push(`placeholders differ: ${JSON.stringify(phrase)} has {${holes(phrase)}}, Roman Urdu has {${holes(UR[phrase])}}`)
  }
}
for (const phrase of Object.keys(UR)) {
  if (!used.has(phrase)) problems.push(`not used anywhere: ${JSON.stringify(phrase)}`)
}

console.log(`${used.size} phrases on screen, ${Object.keys(UR).length} in the Roman Urdu dictionary.`)
for (const p of problems) console.log(`  ✗ ${p}`)
process.exit(problems.length ? 1 : 0)
