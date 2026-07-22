import type { VideoItem } from './video-feed'

/**
 * Pure normalizers for the video discovery feed — YouTube channel RSS (Atom)
 * entries → VideoItem (minus the id, hashed by the fetch script). Kept out of
 * fetch-videos.ts so the mapping is unit-tested without the network.
 */

export type RawVideo = Omit<VideoItem, 'id'>

/**
 * A YouTube channel RSS is Atom: feed.entry[] with yt:videoId, title,
 * link@_href, author.name, published, and media:group>media:thumbnail@_url.
 * fast-xml-parser flattens namespaced tags to e.g. `yt:videoId`.
 */
export function youtubeRssToVideos(entries: unknown[], category: string): RawVideo[] {
  const out: RawVideo[] = []
  for (const raw of entries) {
    const e = raw as {
      'yt:videoId'?: string
      title?: string
      link?: { '@_href'?: string } | { '@_href'?: string }[]
      author?: { name?: string }
      published?: string
      'media:group'?: { 'media:thumbnail'?: { '@_url'?: string } }
    }
    const videoId = e['yt:videoId']
    const title = typeof e.title === 'string' ? e.title : ''
    if (!videoId || !title) continue
    const link = Array.isArray(e.link) ? e.link[0]?.['@_href'] : e.link?.['@_href']
    out.push({
      platform: 'youtube',
      videoId,
      title: title.trim(),
      channel: e.author?.name ?? '',
      url: link ?? `https://www.youtube.com/watch?v=${videoId}`,
      thumb: e['media:group']?.['media:thumbnail']?.['@_url'] ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      published: (e.published ?? '').slice(0, 10),
      category,
    })
  }
  return out
}
