/**
 * Fetches English dictation clips from Tatoeba → data/listening/latest.json.
 *
 * Tatoeba is ideal for dictation: sentences with human-recorded audio (CC-BY
 * 2.0 FR), the sentence text IS the exact transcript, and many carry Chinese
 * translations. Audio plays via <audio> (no CORS needed). Runs in reading.yml,
 * non-fatal: an outage keeps the previous latest.json.
 */
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ListeningFile, type ListeningItem } from '../src/lib/listening-feed'

const ROOT = process.cwd()
const DATA = join(ROOT, 'data', 'listening')
const UA = 'Viki/1.0 (https://github.com/zzxzzk115/Viki; mailto:zzxzzk115@gmail.com)'
const WANT = 12
const notes: string[] = []

interface TatoebaSentence {
  id: number
  text: string
  lang: string
  audios?: { author?: string }[]
  translations?: { lang?: string; text?: string }[][]
}

function firstChinese(s: TatoebaSentence): string {
  for (const group of s.translations ?? []) for (const t of group) if (t?.lang === 'cmn' && t.text) return t.text
  return ''
}

async function main() {
  await mkdir(DATA, { recursive: true })
  const date = new Date().toISOString().slice(0, 10)
  const items: ListeningItem[] = []
  const seen = new Set<string>()

  // A few random pages; each returns ~10 audio sentences with cmn translations.
  for (let page = 1; page <= 3 && items.length < WANT; page++) {
    const url = `https://tatoeba.org/en/api_v0/search?from=eng&has_audio=yes&sort=random&trans_to=cmn&trans_filter=limit&trans_link=direct&page=${page}`
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) })
      if (!r.ok) {
        notes.push(`Tatoeba page ${page}: HTTP ${r.status}`)
        continue
      }
      const j = (await r.json()) as { results?: TatoebaSentence[] }
      for (const s of j.results ?? []) {
        if (items.length >= WANT) break
        if (!s.audios?.length || s.lang !== 'eng') continue
        const words = s.text.split(/\s+/).length
        // Good dictation length: not one-word, not a paragraph.
        if (words < 4 || words > 16) continue
        const id = createHash('sha1').update(String(s.id)).digest('hex').slice(0, 10)
        if (seen.has(id)) continue
        seen.add(id)
        items.push({
          id,
          text: s.text.trim(),
          audio: `https://audio.tatoeba.org/sentences/eng/${s.id}.mp3`,
          translation: firstChinese(s),
          author: s.audios[0]?.author,
        })
      }
      notes.push(`page ${page}: 累计 ${items.length} 条`)
    } catch (e) {
      notes.push(`Tatoeba page ${page} 异常：${e instanceof Error ? e.message : e}`)
    }
    await new Promise((r) => setTimeout(r, 1500))
  }

  if (items.length === 0) {
    console.error('✗ Tatoeba 没拿到数据，保留上一次的 latest.json')
    console.error(notes.map((n) => `  ${n}`).join('\n'))
    process.exit(0)
  }

  const file = ListeningFile.parse({ date, items, notes })
  await writeFile(join(DATA, 'latest.json'), JSON.stringify(file, null, 2))
  console.log(`✓ ${date}: 听力 ${items.length} 条`)
  console.log(notes.map((n) => `  · ${n}`).join('\n'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
