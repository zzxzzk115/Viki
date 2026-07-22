/**
 * Fetches the daily "推荐阅读" feed → data/reading/latest.json.
 *
 * Runs in .github/workflows/reading.yml, which commits the result to the data
 * branch and calls deploy.yml (a GITHUB_TOKEN push does not trigger workflows).
 * Mirrors fetch-papers.ts: getWithRetry backoff, non-fatal on outage (keeps the
 * previous latest.json rather than blanking the page).
 *
 * We store SUMMARY + LINK only — never full article text — so every source
 * stays within a "short excerpt" copyright footing and the CI stays light.
 */
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { readingSources, type ReadingSource } from '../config/reading-sources'
import { ReadingFile, type ReadingItem } from '../src/lib/reading-feed'
import { hnStoryToReading, isReadableTitle, rssItemsToReading, wikiTfaToReading, type RawReading } from '../src/lib/reading-normalize'

const ROOT = process.cwd()
const DATA = join(ROOT, 'data', 'reading')
const UA = 'Viki/1.0 (https://github.com/zzxzzk115/Viki; mailto:zzxzzk115@gmail.com)'
const notes: string[] = []
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get(url: string, tries = 3): Promise<string | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })
      if (r.ok) return await r.text()
      if (r.status === 429 || r.status >= 500) {
        await sleep(2 ** i * 2000)
        continue
      }
      notes.push(`${new URL(url).host} 返回 ${r.status}，跳过`)
      return null
    } catch (e) {
      notes.push(`${new URL(url).host} 请求失败 (${e instanceof Error ? e.message : e})`)
      await sleep(2 ** i * 2000)
    }
  }
  return null
}
const getJson = async <T,>(url: string): Promise<T | null> => {
  const t = await get(url)
  if (!t) return null
  try {
    return JSON.parse(t) as T
  } catch {
    return null
  }
}

const readingId = (url: string) => createHash('sha1').update(url).digest('hex').slice(0, 12)
const withId = (raw: RawReading): ReadingItem => ({ ...raw, id: readingId(raw.url || raw.title) })

async function fromSource(src: ReadingSource): Promise<RawReading[]> {
  if (src.kind === 'wikipedia') {
    const now = new Date()
    const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${String(now.getUTCDate()).padStart(2, '0')}`
    const j = await getJson<{ tfa?: Parameters<typeof wikiTfaToReading>[0] }>(`${src.url}/${path}`)
    const item = j?.tfa ? wikiTfaToReading(j.tfa, src.name, src.category) : null
    return item ? [item] : []
  }
  if (src.kind === 'wiki-random') {
    // The random/summary payload has the same title/extract/content_urls shape.
    const out: RawReading[] = []
    for (let i = 0; i < src.limit; i++) {
      const j = await getJson<Parameters<typeof wikiTfaToReading>[0]>(src.url)
      const item = j ? wikiTfaToReading(j, src.name, src.category) : null
      if (item) out.push(item)
      await sleep(200)
    }
    return out
  }
  if (src.kind === 'hn') {
    const ids = await getJson<number[]>(`${src.url}/topstories.json`)
    if (!ids) return []
    const out: RawReading[] = []
    for (const id of ids.slice(0, src.limit * 2)) {
      if (out.length >= src.limit) break
      const item = await getJson<Parameters<typeof hnStoryToReading>[0]>(`${src.url}/item/${id}.json`)
      const mapped = item ? hnStoryToReading(item, src.name) : null
      // Drop link-less stories (Ask HN with no url would collide on '').
      if (mapped && mapped.url) out.push(mapped)
      await sleep(200)
    }
    return out
  }
  // rss / atom
  const xml = await get(src.url)
  if (!xml) return []
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(xml) as {
    rss?: { channel?: { item?: unknown | unknown[] } }
    feed?: { entry?: unknown | unknown[] }
  }
  const raw = parsed.rss?.channel?.item ?? parsed.feed?.entry ?? []
  const items = Array.isArray(raw) ? raw : [raw]
  return rssItemsToReading(items.slice(0, src.limit), src.name, src.category)
}

async function main() {
  await mkdir(DATA, { recursive: true })
  const date = new Date().toISOString().slice(0, 10)

  const collected: ReadingItem[] = []
  const seenUrls = new Set<string>()
  for (const src of readingSources) {
    try {
      const items = await fromSource(src)
      let dropped = 0
      for (const raw of items) {
        // Skip content in scripts a Chinese/English reader can't follow
        // (the dev.to feed surfaced Arabic SEO spam).
        if (!isReadableTitle(raw.title)) {
          dropped++
          continue
        }
        const item = withId(raw)
        if (seenUrls.has(item.url)) continue
        seenUrls.add(item.url)
        collected.push(item)
      }
      notes.push(`${src.name}: ${items.length - dropped} 条${dropped ? `（跳过 ${dropped} 条非中英内容）` : ''}`)
    } catch (e) {
      notes.push(`${src.name} 抓取异常：${e instanceof Error ? e.message : e}`)
    }
  }

  if (collected.length === 0) {
    console.error('✗ 所有阅读源都没拿到数据，保留上一次的 latest.json')
    console.error(notes.map((n) => `  ${n}`).join('\n'))
    process.exit(0)
  }

  const file = ReadingFile.parse({ date, items: collected, notes })
  await writeFile(join(DATA, 'latest.json'), JSON.stringify(file, null, 2))
  console.log(`✓ ${date}: 推荐阅读 ${collected.length} 条`)
  console.log(notes.map((n) => `  · ${n}`).join('\n'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
