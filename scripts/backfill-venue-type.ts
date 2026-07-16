/**
 * One-shot: add `venueType:` to existing content/papers frontmatter that lacks
 * it, inferred from the venue string (the BibTeX entry types are long gone for
 * already-generated pages). New imports get it from deriveVenueType instead.
 * Idempotent — skips files that already carry the field.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import fg from 'fast-glob'

const RULES: [RegExp, string][] = [
  [/arxiv/i, 'preprint'],
  [/tech report|nvidia corporation/i, 'report'],
  [/gpu pro|crc press|ieee cs press/i, 'book'],
  [/course/i, 'course'],
  [/talks|gdc|sigchi bulletin/i, 'talk'],
  [/tvcg|tog\b|tip\b|cgf\b|jgt\b|jcgt\b|ai review|transactions|journal|psychophysics/i, 'journal'],
  [/siggraph|i3d|hpg|cvpr|vmv|vrst|ieee vr|eurographics|graphics hardware|eccv|iccv/i, 'conference'],
]

function infer(venue: string): string | null {
  for (const [re, t] of RULES) if (re.test(venue)) return t
  return null
}

async function main() {
  const files = await fg('content/papers/*.md', { cwd: process.cwd(), absolute: true })
  let patched = 0
  const unknown: string[] = []

  for (const f of files) {
    const src = await readFile(f, 'utf8')
    if (/^venueType:/m.test(src)) continue
    const venueMatch = src.match(/^venue:\s*"?([^"\n]+)"?\s*$/m)
    if (!venueMatch) continue
    const t = infer(venueMatch[1])
    if (!t) {
      unknown.push(`${basename(f)} (venue: ${venueMatch[1]})`)
      continue
    }
    await writeFile(f, src.replace(venueMatch[0], `${venueMatch[0]}\nvenueType: ${t}`), 'utf8')
    patched++
    console.log(`  ${t.padEnd(10)} ${basename(f)}`)
  }

  console.log(`\n✓ 回填 ${patched} 篇`)
  if (unknown.length) console.log(`⚠ 无法推断 (请手动补): \n  ${unknown.join('\n  ')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})