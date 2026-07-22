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

/** GET text with extra headers (Bilibili needs Referer/Origin/Cookie). */
async function get2(url: string, headers: Record<string, string>): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(30000) })
    return r.ok ? await r.text() : null
  } catch {
    return null
  }
}

// ---- Bilibili WBI signing (their space API is anti-crawl otherwise) ----

const WBI_TAB = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52]
const md5 = (s: string) => createHash('md5').update(s).digest('hex')
let biliAuth: { cookie: string; key: string } | null = null

async function initBili(): Promise<{ cookie: string; key: string } | null> {
  if (biliAuth) return biliAuth
  try {
    // Fresh buvid3/buvid4 — the space API risk-controls a cookieless request.
    const spi = await fetch('https://api.bilibili.com/x/frontend/finger/spi', {
      headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' },
    })
    const sj = (await spi.json()) as { data?: { b_3?: string; b_4?: string } }
    const cookie = `buvid3=${sj.data?.b_3 ?? ''};buvid4=${sj.data?.b_4 ?? ''}`

    const nav = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/', Cookie: cookie },
    })
    const nj = (await nav.json()) as { data?: { wbi_img?: { img_url?: string; sub_url?: string } } }
    const base = (u: string) => u.slice(u.lastIndexOf('/') + 1, u.lastIndexOf('.'))
    const raw = base(nj.data?.wbi_img?.img_url ?? '') + base(nj.data?.wbi_img?.sub_url ?? '')
    const key = WBI_TAB.map((n) => raw[n]).join('').slice(0, 32)
    biliAuth = { cookie, key }
    return biliAuth
  } catch {
    return null
  }
}

function encWbi(params: Record<string, string | number>, key: string): string {
  params.wts = Math.round(Date.now() / 1000)
  const q = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]).replace(/[!'()*]/g, ''))}`)
    .join('&')
  return `${q}&w_rid=${md5(q + key)}`
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
  // Bilibili: WBI-signed space API (RSSHub is too flaky). channel = numeric UID.
  // The space API risk-controls rapid calls, so retry with a fresh cookie/keys.
  type Vlist = { bvid?: string; title?: string; pic?: string; created?: number; author?: string }
  let vlist: Vlist[] | null = null
  for (let attempt = 0; attempt < 3 && !vlist; attempt++) {
    if (attempt > 0) {
      biliAuth = null // fresh buvid + keys often clears risk control
      await sleep(1500 * attempt)
    }
    const auth = await initBili()
    if (!auth) continue
    const q = encWbi(
      { mid: src.channel, ps: Math.max(5, src.limit), pn: 1, order: 'pubdate', platform: 'web', web_location: 1550101, dm_img_str: 'V2ViR0w', dm_cover_img_str: '', dm_img_list: '[]' },
      auth.key,
    )
    const body = await get2(`https://api.bilibili.com/x/space/wbi/arc/search?${q}`, {
      Referer: `https://space.bilibili.com/${src.channel}/video`,
      Origin: 'https://space.bilibili.com',
      Cookie: auth.cookie,
    })
    if (!body) continue
    try {
      const j = JSON.parse(body) as { code?: number; message?: string; data?: { list?: { vlist?: Vlist[] } } }
      if (j.code === 0) vlist = j.data?.list?.vlist ?? []
      else if (attempt === 2) notes.push(`Bilibili ${src.channel}: code=${j.code} ${j.message ?? ''}`)
    } catch {
      if (attempt === 2) notes.push(`Bilibili ${src.channel}: 返回非 JSON（风控）`)
    }
  }
  if (!vlist) return []
  return vlist.slice(0, src.limit).map((v) => ({
    platform: 'bilibili' as const,
    videoId: v.bvid ?? '',
    title: (v.title ?? '').replace(/<[^>]+>/g, '').trim(),
    channel: v.author ?? `UID ${src.channel}`,
    url: `https://www.bilibili.com/video/${v.bvid}`,
    // Bilibili thumbs are //i*.hdslb.com/...; make absolute.
    thumb: v.pic ? (v.pic.startsWith('//') ? `https:${v.pic}` : v.pic) : '',
    published: v.created ? new Date(v.created * 1000).toISOString().slice(0, 10) : '',
    category: src.category,
  })).filter((v) => v.videoId)
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
