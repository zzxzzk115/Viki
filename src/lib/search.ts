import MiniSearch, { type Options } from 'minisearch'

/**
 * Shared search config. Imported by BOTH the build script (to create the index)
 * and the client (to load it) — the tokenizer must be identical on each side or
 * the tokens simply will not match and every query returns nothing.
 *
 * That also means this module must stay free of server-only imports.
 */

export interface SearchDoc {
  id: string
  title: string
  /** '' for papers, which have a venue instead. */
  subject: string
  level: string
  tags: string[]
  summary: string
  /** Body text plus the English and abbreviation of every glossary term used. */
  text: string
  href: string
  kind: 'note' | 'paper'
}

/**
 * Chinese has no spaces, so minisearch's default tokenizer (split on
 * whitespace/punctuation) turns a whole sentence into ONE token and every query
 * misses. Measured: 「辐射亮度沿真空中的光线传播不变」 -> 1 token by default,
 * 8 tokens through Segmenter.
 *
 * Built lazily: constructing a Segmenter is not free, and this is called once
 * per field per document at index time.
 */
let segmenter: Intl.Segmenter | undefined

export function tokenize(text: string): string[] {
  segmenter ??= new Intl.Segmenter('zh', { granularity: 'word' })
  const out: string[] = []
  for (const { segment, isWordLike } of segmenter.segment(text)) {
    if (isWordLike) out.push(segment)
  }
  return out
}

export const searchOptions: Options<SearchDoc> = {
  fields: ['title', 'tags', 'summary', 'text'],
  storeFields: ['title', 'subject', 'level', 'href', 'kind', 'summary'],
  tokenize,
  processTerm: (term) => term.toLowerCase(),
  searchOptions: {
    boost: { title: 4, tags: 2, summary: 1.5 },
    prefix: true,
    fuzzy: 0.15,
    combineWith: 'AND',
  },
}

export function createIndex(docs: SearchDoc[]): MiniSearch<SearchDoc> {
  const mini = new MiniSearch<SearchDoc>(searchOptions)
  mini.addAll(docs)
  return mini
}

/** Options must match what the index was built with — tokenize is a function
 *  and cannot survive serialization, so it is re-supplied here. */
export function loadIndex(json: string): MiniSearch<SearchDoc> {
  return MiniSearch.loadJSON<SearchDoc>(json, searchOptions)
}
