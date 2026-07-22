/**
 * Backfills content/english/vocab/collected.md from Cambridge.
 *
 * Words added via 「加入单词本」 before the daily word switched to Cambridge kept
 * the old machine-translated definition (non-standard). This re-fetches each
 * ::::word headword from Cambridge and rewrites the block with proper Chinese
 * meaning, UK/US IPA and a bilingual example. Words Cambridge can't parse keep
 * their original block. Run once (or whenever): `pnpm enrich-vocab`.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fetchCambridge, type WordData } from './cambridge'

const FILE = join(process.cwd(), 'content', 'english', 'vocab', 'collected.md')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function buildBlock(word: string, d: WordData): string {
  const attrs = [d.ipa ? `ipa="${d.ipa}"` : '', d.pos ? `pos=${d.pos}` : ''].filter(Boolean).join(' ')
  const meaning = d.definitionZh ? `${d.definitionZh}${d.definition ? `（${d.definition}）` : ''}` : d.definition
  const example = d.example ? `${d.example}${d.exampleZh ? `\n${d.exampleZh}` : ''}` : ''
  return [
    `::::word${attrs ? `{${attrs}}` : ''}`,
    word,
    '',
    ':::meaning',
    meaning || '(补充释义)',
    ':::',
    ...(example ? ['', ':::example', example, ':::'] : []),
    '::::',
  ].join('\n')
}

async function main() {
  let md: string
  try {
    md = await readFile(FILE, 'utf8')
  } catch {
    console.log('没有 collected.md，跳过')
    return
  }

  const blockRe = /::::word(?:\{[^}]*\})?\r?\n([\s\S]*?)\r?\n::::/g
  const matches = [...md.matchAll(blockRe)]
  if (matches.length === 0) {
    console.log('collected.md 里没有 ::::word 块')
    return
  }

  let out = ''
  let last = 0
  let updated = 0
  for (const m of matches) {
    const word = (m[1].split(/\r?\n/).find((l) => l.trim()) ?? '').trim()
    out += md.slice(last, m.index)
    last = m.index! + m[0].length

    const data = word ? await fetchCambridge(word) : null
    if (data) {
      out += buildBlock(word, data)
      updated++
      console.log(`✓ ${word} — ${data.definitionZh || data.definition.slice(0, 40)}`)
    } else {
      out += m[0] // keep original on miss
      console.log(`· ${word || '(空)'} — Cambridge 无结果，保留原样`)
    }
    await sleep(800) // be polite
  }
  out += md.slice(last)

  if (out !== md) {
    await writeFile(FILE, out)
    console.log(`\n更新了 ${updated}/${matches.length} 个单词块`)
  } else {
    console.log('\n无变化')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
