/**
 * Picks a date-seeded word from config/word-list.txt, enriches it from the
 * free Dictionary API (api.dictionaryapi.dev — no key, and CI has no CORS
 * problem), and writes data/vocab/daily.json.
 *
 * Runs in reading.yml. Non-fatal: on any API failure the word still ships with
 * whatever fields we have. The definition is English (E-E practice); the
 * homepage's 「加入单词本」 turns it into a ::::word for the vocab track.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = process.cwd()
const OUT = join(ROOT, 'data', 'vocab')

/** djb2 over the UTC date — deterministic pick, stable within a day. */
function dailyIndex(seed: string, len: number): number {
  if (len <= 0) return 0
  let h = 5381
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0
  return h % len
}

interface DictEntry {
  phonetic?: string
  phonetics?: { text?: string }[]
  meanings?: { partOfSpeech?: string; definitions?: { definition?: string; example?: string }[] }[]
}

/**
 * English → Chinese via MyMemory (free, no key; CI has no CORS issue). Returns
 * '' on any failure — the word still ships, just without the gloss.
 */
async function translateZh(text: string): Promise<string> {
  if (!text.trim()) return ''
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN&de=zzxzzk115@gmail.com`
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) return ''
    const j = (await r.json()) as { responseData?: { translatedText?: string } }
    const t = j.responseData?.translatedText ?? ''
    // MyMemory echoes a warning string into the field when it rejects a query.
    return /MYMEMORY WARNING|INVALID/i.test(t) ? '' : t.trim()
  } catch {
    return ''
  }
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const date = new Date().toISOString().slice(0, 10)

  const list = (await readFile(join(ROOT, 'config', 'word-list.txt'), 'utf8'))
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  if (list.length === 0) {
    console.error('✗ 词表为空')
    process.exit(0)
  }
  const word = list[dailyIndex(date, list.length)]

  const out: {
    date: string
    word: string
    ipa: string
    pos: string
    definition: string
    definitionZh: string
    example: string
    exampleZh: string
  } = { date, word, ipa: '', pos: '', definition: '', definitionZh: '', example: '', exampleZh: '' }

  try {
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      signal: AbortSignal.timeout(20000),
    })
    if (r.ok) {
      const entries = (await r.json()) as DictEntry[]
      const e = entries[0]
      out.ipa = e?.phonetic ?? e?.phonetics?.find((p) => p.text)?.text ?? ''
      const meaning = e?.meanings?.[0]
      out.pos = meaning?.partOfSpeech ?? ''
      const def = meaning?.definitions?.[0]
      out.definition = def?.definition ?? ''
      out.example = def?.example ?? ''
    } else {
      console.error(`词典 API 返回 ${r.status}，仅写单词`)
    }
  } catch (e) {
    console.error(`词典 API 请求失败：${e instanceof Error ? e.message : e}，仅写单词`)
  }

  // Chinese glosses so the card shows meaning + example translation, not just E-E.
  ;[out.definitionZh, out.exampleZh] = await Promise.all([
    translateZh(out.definition),
    translateZh(out.example),
  ])

  await writeFile(join(OUT, 'daily.json'), JSON.stringify(out, null, 2))
  console.log(`✓ ${date}: 每日单词 ${word}${out.definitionZh ? ` — ${out.definitionZh}` : out.definition ? ` — ${out.definition.slice(0, 50)}` : ''}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
