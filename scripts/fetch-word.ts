/**
 * Picks a date-seeded word from config/word-list.txt, enriches it, and writes
 * data/vocab/daily.json.
 *
 * Primary source is Cambridge's 英语-汉语（简体）dictionary page — it has
 * human-curated Chinese definitions, UK+US audio and both IPAs, all far better
 * than machine-translating a monolingual definition. Cambridge has no free open
 * API (theirs is approval-gated), so this reads the public page; it is one word
 * a day for personal, non-redistributive use, and falls back to the free
 * dictionary API + MyMemory when the page can't be parsed. Runs in reading.yml,
 * non-fatal at every step.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = process.cwd()
const OUT = join(ROOT, 'data', 'vocab')
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

interface WordData {
  ipa: string
  ipaUs: string
  pos: string
  definition: string
  definitionZh: string
  example: string
  exampleZh: string
  audioUk: string
  audioUs: string
}

/** Scrape Cambridge 英汉简体. Returns null when the page is missing/unparseable. */
async function fetchCambridge(word: string): Promise<WordData | null> {
  let html: string
  try {
    const r = await fetch(
      `https://dictionary.cambridge.org/zhs/%E8%AF%8D%E5%85%B8/%E8%8B%B1%E8%AF%AD-%E6%B1%89%E8%AF%AD-%E7%AE%80%E4%BD%93/${encodeURIComponent(word)}`,
      { headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' }, signal: AbortSignal.timeout(20000) },
    )
    if (!r.ok) return null
    html = await r.text()
  } catch {
    return null
  }

  const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  const definition = strip(html.match(/class="def ddef_d[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '')
  const definitionZh = strip(html.match(/class="trans dtrans dtrans-se[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '')
  if (!definition && !definitionZh) return null // not a real entry (e.g. a spellcheck page)

  const ipas = [...html.matchAll(/class="ipa dipa[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1])
  const audioAbs = (rel: string | undefined) => (rel ? `https://dictionary.cambridge.org${rel}` : '')
  const eg = html.match(/class="examp dexamp"[\s\S]*?<\/div>/)?.[0] ?? ''

  return {
    ipa: ipas[0] ?? '',
    ipaUs: ipas[1] ?? '',
    pos: html.match(/class="pos dpos"[^>]*>([^<]+)</)?.[1] ?? '',
    definition,
    definitionZh,
    example: strip(eg.match(/class="eg deg"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ''),
    exampleZh: strip(eg.match(/class="trans dtrans[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ''),
    audioUk: audioAbs(html.match(/"([^"]*\/uk_pron\/[^"]*\.mp3)"/i)?.[1]),
    audioUs: audioAbs(html.match(/"([^"]*\/us_pron\/[^"]*\.mp3)"/i)?.[1]),
  }
}

/** djb2 over the UTC date — deterministic pick, stable within a day. */
function dailyIndex(seed: string, len: number): number {
  if (len <= 0) return 0
  let h = 5381
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0
  return h % len
}

interface DictEntry {
  phonetic?: string
  phonetics?: { text?: string; audio?: string }[]
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

  let data = await fetchCambridge(word)
  let source = 'Cambridge'

  // Fallback: free dictionary API + MyMemory translation.
  if (!data) {
    source = 'dictionaryapi.dev'
    const fb: WordData = { ipa: '', ipaUs: '', pos: '', definition: '', definitionZh: '', example: '', exampleZh: '', audioUk: '', audioUs: '' }
    try {
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal: AbortSignal.timeout(20000) })
      if (r.ok) {
        const e = ((await r.json()) as DictEntry[])[0]
        fb.ipa = e?.phonetic ?? e?.phonetics?.find((p) => p.text)?.text ?? ''
        const meaning = e?.meanings?.[0]
        fb.pos = meaning?.partOfSpeech ?? ''
        fb.definition = meaning?.definitions?.[0]?.definition ?? ''
        fb.example = meaning?.definitions?.[0]?.example ?? ''
        for (const p of e?.phonetics ?? []) {
          if (!p.audio) continue
          const url = p.audio.startsWith('//') ? `https:${p.audio}` : p.audio
          if (/-uk\.mp3$/i.test(url) && !fb.audioUk) fb.audioUk = url
          else if (/-us\.mp3$/i.test(url) && !fb.audioUs) fb.audioUs = url
        }
      }
    } catch {}
    ;[fb.definitionZh, fb.exampleZh] = await Promise.all([translateZh(fb.definition), translateZh(fb.example)])
    data = fb
  }

  // daily.json shape unchanged (ipa = UK); component reads these fields as-is.
  const out = { date, word, ...data }
  await writeFile(join(OUT, 'daily.json'), JSON.stringify(out, null, 2))
  console.log(`✓ ${date}: 每日单词 ${word}（${source}）${out.definitionZh ? ` — ${out.definitionZh}` : out.definition ? ` — ${out.definition.slice(0, 50)}` : ''}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
