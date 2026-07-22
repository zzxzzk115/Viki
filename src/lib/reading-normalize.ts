import type { ReadingItem } from './reading-feed'

/**
 * Pure normalizers: raw source payloads → ReadingItem (minus the id, which the
 * fetch script hashes from the url). Kept separate from fetch-reading.ts so the
 * shape of every source's mapping is unit-tested without the network.
 */

export type RawReading = Omit<ReadingItem, 'id'>

export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function capSummary(s: string, max = 280): string {
  const t = stripHtml(s)
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** RSS `<item>` objects (as parsed by fast-xml-parser) → RawReading[]. */
export function rssItemsToReading(
  items: unknown[],
  source: string,
  category: RawReading['category'],
): RawReading[] {
  const out: RawReading[] = []
  for (const raw of items) {
    const it = raw as {
      title?: string | { '#text'?: string }
      link?: string | { '#text'?: string; '@_href'?: string }
      description?: string
      summary?: string
      'content:encoded'?: string
      pubDate?: string
      published?: string
      updated?: string
      author?: string | { name?: string }
      'dc:creator'?: string
      category?: string | string[]
    }
    const text = (v: unknown): string =>
      typeof v === 'string' ? v : ((v as { '#text'?: string })?.['#text'] ?? '')
    const title = text(it.title).trim()
    // Atom links can be an object with @_href; RSS is a plain string.
    const link =
      typeof it.link === 'string' ? it.link : (it.link?.['@_href'] ?? it.link?.['#text'] ?? '')
    if (!title || !link) continue
    const author =
      typeof it.author === 'string' ? it.author : (it.author?.name ?? it['dc:creator'] ?? undefined)
    const tags = Array.isArray(it.category)
      ? it.category.map((c) => String(c)).slice(0, 4)
      : it.category
        ? [String(it.category)]
        : []
    out.push({
      category,
      source,
      title: stripHtml(title),
      url: link.trim(),
      summary: capSummary(it.description ?? it.summary ?? it['content:encoded'] ?? ''),
      author: author ? stripHtml(String(author)) : undefined,
      published: (it.pubDate ?? it.published ?? it.updated ?? '').trim(),
      tags,
    })
  }
  return out
}

/** A Hacker News item (v0 API) → RawReading. Link stories have no body, so the
 *  title carries the content; Ask/Show HN text becomes the summary. */
export function hnStoryToReading(
  item: { title?: string; url?: string; by?: string; time?: number; score?: number; text?: string; type?: string },
  source: string,
): RawReading | null {
  if (!item?.title || item.type !== 'story') return null
  const url = item.url ?? `https://news.ycombinator.com/item?id=${''}` // fallback handled by caller id
  return {
    category: 'tech',
    source,
    title: stripHtml(item.title),
    url: item.url ?? '',
    summary: item.text ? capSummary(item.text) : '',
    author: item.by,
    published: item.time ? new Date(item.time * 1000).toISOString().slice(0, 10) : '',
    tags: typeof item.score === 'number' ? [`▲ ${item.score}`] : [],
  }
}

/** Wikipedia REST /feed/featured `tfa` object → RawReading. */
export function wikiTfaToReading(
  tfa: { title?: string; normalizedtitle?: string; extract?: string; content_urls?: { desktop?: { page?: string } } },
  source: string,
  category: RawReading['category'],
): RawReading | null {
  const page = tfa?.content_urls?.desktop?.page
  const title = tfa?.normalizedtitle ?? tfa?.title
  if (!page || !title) return null
  return {
    category,
    source,
    title: stripHtml(title.replace(/_/g, ' ')),
    url: page,
    summary: capSummary(tfa.extract ?? ''),
    published: '',
    tags: ['今日精选'],
  }
}
