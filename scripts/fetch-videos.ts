/**
 * Fetches recent uploads from subscribed channels → data/videos/latest.json.
 *
 * Runs in videos.yml (commits to the data branch, calls deploy.yml). YouTube is
 * the backbone: a channel's RSS (feeds/videos.xml?channel_id=UC…) needs no key;
 * @handles are resolved by reading the channel page once. Bilibili discovery is
 * best-effort via RSSHub (non-fatal). Non-fatal overall — a source outage keeps
 * the previous latest.json.
 */
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { videoSources, type VideoSource } from '../config/video-sources'
import { VideoFile, type VideoItem } from '../src/lib/video-feed'
import { youtubeRssToVideos, type RawVideo } from '../src/lib/video-normalize'

const ROOT = process.cwd()
const DATA = join(ROOT, 'data', 'videos')
const UA = 'Viki/1.0 (https://github.com/zzxzzk115/Viki; mailto:zzxzzk115@gmail.com)'
const notes: string[] = []
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

async function get(url: string, tries = 3): Promise<string | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })
      if (r.ok) return await r.text()
      if (r.status === 429 || r.status >= 500) {
        await sleep(2 ** i * 2000)
        continue
      }
      return null
    } catch {
      await sleep(2 ** i * 2000)
    }
  }
  return null
}

/** @handle or UC… → channel_id (UC…). Reads the channel page for the id. */
async function resolveChannelId(channel: string): Promise<string | null> {
  if (/^UC[\w-]{20,}$/.test(channel)) return channel
  const handle = channel.startsWith('@') ? channel : `@${channel}`
  const html = await get(`https://www.youtube.com/${handle}`)
  return html?.match(/"channelId":"(UC[\w-]+)"/)?.[1] ?? html?.match(/channel_id=(UC[\w-]+)/)?.[1] ?? null
}

async function fromSource(src: VideoSource): Promise<RawVideo[]> {
  if (src.platform === 'youtube') {
    const cid = await resolveChannelId(src.channel)
    if (!cid) {
      notes.push(`${src.channel}: 解析不到 channel_id，跳过`)
      return []
    }
    const feed = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`)
    if (!feed) return []
    const parsed = xml.parse(feed) as { feed?: { entry?: unknown | unknown[] } }
    const raw = parsed.feed?.entry ?? []
    const entries = Array.isArray(raw) ? raw : [raw]
    return youtubeRssToVideos(entries.slice(0, src.limit), src.category)
  }
  // Bilibili best-effort via a public RSSHub instance.
  const feed = await get(`https://rsshub.app/bilibili/user/video/${src.channel}`)
  if (!feed) {
    notes.push(`Bilibili ${src.channel}: 抓取失败（RSSHub 不稳，可改手动收藏）`)
    return []
  }
  const parsed = xml.parse(feed) as { rss?: { channel?: { item?: unknown | unknown[] } } }
  const raw = parsed.rss?.channel?.item ?? []
  const items = (Array.isArray(raw) ? raw : [raw]).slice(0, src.limit)
  const out: RawVideo[] = []
  for (const it of items as { title?: string; link?: string }[]) {
    const bv = it.link?.match(/(BV[0-9A-Za-z]{10})/)?.[1]
    if (!it.title || !bv) continue
    out.push({
      platform: 'bilibili',
      videoId: bv,
      title: String(it.title).trim(),
      channel: `UID ${src.channel}`,
      url: `https://www.bilibili.com/video/${bv}`,
      thumb: '',
      published: '',
      category: src.category,
    })
  }
  return out
}

const videoId2 = (url: string) => createHash('sha1').update(url).digest('hex').slice(0, 12)

async function main() {
  await mkdir(DATA, { recursive: true })
  const date = new Date().toISOString().slice(0, 10)
  const items: VideoItem[] = []
  const seen = new Set<string>()

  for (const src of videoSources) {
    try {
      const vids = await fromSource(src)
      let n = 0
      for (const raw of vids) {
        if (seen.has(raw.videoId)) continue
        seen.add(raw.videoId)
        items.push({ ...raw, id: videoId2(raw.url) })
        n++
      }
      notes.push(`${src.category} · ${src.channel}: ${n} 条`)
      await sleep(300)
    } catch (e) {
      notes.push(`${src.channel} 异常：${e instanceof Error ? e.message : e}`)
    }
  }

  if (items.length === 0) {
    console.error('✗ 没有拿到任何视频，保留上一次的 latest.json')
    console.error(notes.map((n) => `  ${n}`).join('\n'))
    process.exit(0)
  }

  const file = VideoFile.parse({ date, items, notes })
  await writeFile(join(DATA, 'latest.json'), JSON.stringify(file, null, 2))
  console.log(`✓ ${date}: 订阅视频 ${items.length} 条`)
  console.log(notes.map((n) => `  · ${n}`).join('\n'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
