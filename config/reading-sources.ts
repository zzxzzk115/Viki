/**
 * Sources for the daily "推荐阅读" feed (scripts/fetch-reading.ts).
 *
 * All chosen for: a public no-key endpoint that sends CORS-clean data, and a
 * license that permits storing a short SUMMARY (we store summary + link only,
 * never full text). Add or swap freely — the script skips any source that
 * fails and logs it, so a dead feed never breaks the run.
 *
 * - `wikipedia`: REST /feed/featured/<yyyy>/<mm>/<dd> → today's featured article
 *   (title + extract). Simple English Wikipedia doubles as graded reading.
 * - `hn`: Hacker News v0 API — top stories (title + link; no body).
 * - `rss`: any RSS/Atom feed with item descriptions.
 */

export interface ReadingSource {
  name: string
  category: 'english' | 'tech' | 'culture' | 'finance' | 'news'
  /** wikipedia = today's featured article; wiki-random = random page summary
   *  (Simple English Wikipedia has no featured-article process, but its random
   *  summaries are graded English); hn = Hacker News; rss = any RSS/Atom feed. */
  kind: 'wikipedia' | 'wiki-random' | 'hn' | 'rss'
  /** Base URL; the script appends what each kind needs. */
  url: string
  /** Max items to take from this source per run. */
  limit: number
}

export const readingSources: ReadingSource[] = [
  // 英语学习：Simple English Wikipedia 随机词条摘要 = 分级英语读物
  {
    name: 'Simple English Wikipedia',
    category: 'english',
    kind: 'wiki-random',
    url: 'https://simple.wikipedia.org/api/rest_v1/page/random/summary',
    limit: 2,
  },
  // 技术/研究：Hacker News 头条 + 一个真实带摘要的 RSS
  { name: 'Hacker News', category: 'tech', kind: 'hn', url: 'https://hacker-news.firebaseio.com/v0', limit: 6 },
  { name: 'DEV Community', category: 'tech', kind: 'rss', url: 'https://dev.to/feed/tag/webdev', limit: 4 },
  // 通识/文化：English Wikipedia 今日精选
  {
    name: 'Wikipedia',
    category: 'culture',
    kind: 'wikipedia',
    url: 'https://en.wikipedia.org/api/rest_v1/feed/featured',
    limit: 1,
  },
  // 时效新闻——保持知识输入的时效性（非中英内容会被语言过滤丢弃）
  { name: 'BBC 世界', category: 'news', kind: 'rss', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', limit: 4 },
  { name: 'Ars Technica', category: 'tech', kind: 'rss', url: 'https://feeds.arstechnica.com/arstechnica/index', limit: 3 },
  { name: 'MarketWatch', category: 'finance', kind: 'rss', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', limit: 3 },
]
