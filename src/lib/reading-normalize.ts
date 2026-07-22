import type { ReadingItem } from './reading-feed'

/**
 * Pure normalizers: raw source payloads → ReadingItem (minus the id, which the
 * fetch script hashes from the url). Kept separate from fetch-reading.ts so the
 * shape of every source's mapping is unit-tested without the network.
 */

export type RawReading = Omit<ReadingItem, 'id'>

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
}

/**
 * Decodes HTML entities — named, decimal (&#47;) AND hex (&#x2F;). Hacker News
 * in particular returns text with hex-encoded slashes/quotes, which showed up
 * raw in reading summaries (`https:&#x2F;&#x2F;…`) before this handled them.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED[name] ?? m)
}

function safeCodePoint(n: number): string {
  try {
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
  } catch {
    return ''
  }
}

export function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

export function capSummary(s: string, max = 280): string {
  const t = stripHtml(s)
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

// Latin (+ accents) and CJK ideographs — the scripts a Chinese/English reader
// follows. Kana, Hangul, Arabic, Cyrillic, etc. are "foreign" here.
const READABLE = /[A-Za-zÀ-ɏ一-鿿㐀-䶿]/
const LETTER = /\p{L}/u

/**
 * Keeps items a Chinese/English reader can actually read: true unless the
 * title's letters are mostly a script they don't read (the DEV Community feed
 * was surfacing Arabic SEO spam). No letters at all (numbers/symbols) → keep.
 */
export function isReadableTitle(title: string): boolean {
  const letters = [...title].filter((c) => LETTER.test(c))
  if (letters.length === 0) return true
  const ok = letters.filter((c) => READABLE.test(c)).length
  return ok / letters.length >= 0.5
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
