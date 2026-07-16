/**
 * Fetches candidate papers and writes data/papers/latest.json + an archive entry.
 *
 * Runs in .github/workflows/papers.yml, which commits the result and then calls
 * deploy.yml directly. It does NOT rely on its own commit triggering a deploy:
 * a push made with the repo GITHUB_TOKEN does not trigger workflows, so the
 * naive cron→commit→(expect deploy) chain would silently never publish.
 *
 * arXiv is primary — it is the preprint firehose and the most timely. It does
 * rate-limit under bursts (verified: repeated calls return 429 "Rate exceeded"),
 * so requests retry with backoff. OpenAlex is the fallback: open, no API key,
 * and it indexes published work arXiv misses.
 *
 * Google Scholar is deliberately not a provider: it has no public API, and
 * scraping it violates its terms and gets blocked quickly.
 *
 * Failure is non-fatal by design. If every provider is down, the previous
 * latest.json stays in place and the site keeps building — a feed outage must
 * not take the knowledge base down with it.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { feeds } from '../config/feeds'
import { FeedFile, type FeedPaper } from '../src/lib/papers-feed'

const ROOT = process.cwd()
const DATA = join(ROOT, 'data', 'papers')
const UA = 'Viki/1.0 (https://github.com/zzxzzk115/Viki; mailto:zzxzzk115@gmail.com)'

const notes: string[] = []

function todayKey(): string {
  // The workflow runs on UTC; the date only labels the archive entry.
  return new Date().toISOString().slice(0, 10)
}

async function getWithRetry(url: string, tries = 4): Promise<string | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })
      if (r.ok) return await r.text()
      // 429 is the one that actually happens; back off rather than give up.
      if (r.status === 429 || r.status >= 500) {
        const wait = 2 ** i * 3000
        notes.push(`${new URL(url).host} 返回 ${r.status}，${wait / 1000}s 后重试 (${i + 1}/${tries})`)
        await sleep(wait)
        continue
      }
      notes.push(`${new URL(url).host} 返回 ${r.status}，放弃`)
      return null
    } catch (e) {
      const wait = 2 ** i * 3000
      notes.push(`${new URL(url).host} 请求失败 (${e instanceof Error ? e.message : e})，${wait / 1000}s 后重试`)
      await sleep(wait)
    }
  }
  return null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Scores a paper against the tiered keywords. Returns null below minScore.
 *
 * Tiering matters: with a flat list, 'rendering' and 'foveated' count the same
 * and a dozen generic graphics papers a day bury the handful that are actually
 * on-topic. Core terms are worth more than the primary-category bonus, so a
 * foveated paper in cs.HC outranks a generic one in cs.GR.
 */
function judge(
  title: string,
  abstract: string,
  categories: string[],
): { score: number; matched: string[] } | null {
  const hay = `${title} ${abstract}`.toLowerCase()
  const t = title.toLowerCase()

  if (feeds.exclude.some((w) => hay.includes(w.toLowerCase()))) return null

  const { core, related, context } = feeds.keywords
  const w = feeds.weights

  const hit = (list: string[]) => list.filter((k) => hay.includes(k.toLowerCase()))
  const coreHits = hit(core)
  const relatedHits = hit(related)
  const contextHits = hit(context)

  const inTitle = [...core, ...related].filter((k) => t.includes(k.toLowerCase()))

  const isPrimary = categories.some((c) => feeds.primaryCategories.includes(c))

  const score =
    coreHits.length * w.core +
    relatedHits.length * w.related +
    contextHits.length * w.context +
    inTitle.length * w.titleBonus +
    (isPrimary ? w.primaryBonus : 0)

  if (score < feeds.minScore) return null

  // Report the meaningful hits, not every context word.
  return { score, matched: [...coreHits, ...relatedHits] }
}

// ---- arXiv ----

interface AtomEntry {
  id?: string
  title?: string
  summary?: string
  published?: string
  author?: { name?: string } | { name?: string }[]
  category?: { '@_term'?: string } | { '@_term'?: string }[]
  link?: { '@_href'?: string; '@_title'?: string }[]
  'arxiv:comment'?: string | { '#text'?: string }
}

const arr = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x])

async function fetchArxiv(): Promise<FeedPaper[]> {
  const cats = [...feeds.primaryCategories, ...feeds.secondaryCategories]
  const query = cats.map((c) => `cat:${c}`).join('+OR+')
  // https, not http: http 301-redirects and some clients will not follow it.
  const url =
    `https://export.arxiv.org/api/query?search_query=${query}` +
    `&sortBy=submittedDate&sortOrder=descending&start=0&max_results=${feeds.maxResults}`

  const xml = await getWithRetry(url)
  if (!xml) {
    notes.push('arXiv 抓取失败')
    return []
  }

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const feed = parser.parse(xml)?.feed
  const entries: AtomEntry[] = arr(feed?.entry)

  const out: FeedPaper[] = []
  for (const e of entries) {
    const title = clean(e.title)
    const abstract = clean(e.summary)
    if (!title) continue

    const categories = arr(e.category)
      .map((c) => c['@_term'])
      .filter((c): c is string => !!c)

    const verdict = judge(title, abstract, categories)
    if (!verdict) continue

    // '2607.13808v1' -> '2607.13808'. Dedup must ignore the version, or a v2
    // re-announcement resurfaces a paper already seen.
    const rawId = String(e.id ?? '').split('/abs/')[1] ?? ''
    const id = rawId.replace(/v\d+$/, '')
    if (!id) continue

    out.push({
      id,
      source: 'arxiv',
      title,
      authors: arr(e.author)
        .map((a) => a.name)
        .filter((n): n is string => !!n),
      abstract,
      published: String(e.published ?? '').slice(0, 10),
      url: `https://arxiv.org/abs/${id}`,
      pdf: `https://arxiv.org/pdf/${id}`,
      categories,
      matched: verdict.matched,
      score: verdict.score,
      comment: clean(typeof e['arxiv:comment'] === 'string' ? e['arxiv:comment'] : e['arxiv:comment']?.['#text']),
    })
  }
  return out
}

// ---- OpenAlex (fallback) ----

async function fetchOpenAlex(): Promise<FeedPaper[]> {
  // Only the strongest keywords: OpenAlex search is broad and this is a backup.
  const q = encodeURIComponent('foveated rendering OR gaze-contingent rendering OR perceptual rendering')
  const url =
    `https://api.openalex.org/works?search=${q}` +
    `&per-page=${Math.min(feeds.maxResults, 50)}&sort=publication_date:desc&mailto=zzxzzk115@gmail.com`

  const json = await getWithRetry(url)
  if (!json) {
    notes.push('OpenAlex 抓取失败')
    return []
  }

  interface Work {
    id?: string
    title?: string
    publication_date?: string
    doi?: string
    abstract_inverted_index?: Record<string, number[]>
    authorships?: { author?: { display_name?: string } }[]
    primary_location?: { landing_page_url?: string; pdf_url?: string }
  }

  const results: Work[] = JSON.parse(json)?.results ?? []
  const out: FeedPaper[] = []

  for (const w of results) {
    const title = clean(w.title)
    if (!title) continue
    const abstract = deInvert(w.abstract_inverted_index)
    const verdict = judge(title, abstract, [])
    if (!verdict) continue

    out.push({
      id: (w.id ?? '').replace('https://openalex.org/', ''),
      source: 'openalex',
      title,
      authors: (w.authorships ?? []).map((a) => a.author?.display_name ?? '').filter(Boolean),
      abstract,
      published: w.publication_date ?? '',
      url: w.primary_location?.landing_page_url ?? w.doi ?? `https://openalex.org/${w.id}`,
      pdf: w.primary_location?.pdf_url,
      categories: [],
      matched: verdict.matched,
      score: verdict.score,
    })
  }
  return out
}

/** OpenAlex ships abstracts as an inverted index rather than text. */
function deInvert(idx: Record<string, number[]> | undefined): string {
  if (!idx) return ''
  const words: string[] = []
  for (const [word, positions] of Object.entries(idx)) {
    for (const p of positions) words[p] = word
  }
  return words.join(' ')
}

function clean(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

// ---- main ----

async function main() {
  const date = todayKey()
  await mkdir(join(DATA, 'history'), { recursive: true })

  // Rolling id set, so a paper is never recommended twice — this also absorbs
  // arXiv re-announcing a cross-listed paper.
  const seenPath = join(DATA, 'seen.json')
  const seen = new Set<string>(
    await readFile(seenPath, 'utf8')
      .then((t) => JSON.parse(t) as string[])
      .catch(() => []),
  )

  let candidates = await fetchArxiv()
  if (candidates.length === 0) {
    notes.push('arXiv 无结果，回退到 OpenAlex')
    candidates = await fetchOpenAlex()
  }

  const fresh = candidates
    .filter((p) => !seen.has(p.id))
    .sort((a, b) => b.score - a.score || b.published.localeCompare(a.published))

  const picked = fresh.slice(0, feeds.dailyLimit)
  if (fresh.length > picked.length) {
    // Say what was dropped: a silent cut reads as "this was everything".
    notes.push(`${fresh.length} 篇符合条件，按分数取前 ${picked.length} 篇`)
  }

  if (picked.length === 0 && candidates.length === 0) {
    // Keep the previous latest.json rather than publish an empty feed — a
    // provider outage must not look like a quiet day, and must not blank the page.
    console.error('✗ 所有来源都没拿到数据，保留上一次的 latest.json')
    console.error(notes.map((n) => `  ${n}`).join('\n'))
    process.exit(0)
  }

  for (const p of picked) seen.add(p.id)

  const file = FeedFile.parse({ date, papers: picked, notes })
  await writeFile(join(DATA, 'latest.json'), JSON.stringify(file, null, 2))
  await writeFile(join(DATA, 'history', `${date}.json`), JSON.stringify(file, null, 2))
  await writeFile(seenPath, JSON.stringify([...seen], null, 0))

  if (feeds.historyDays > 0) {
    const cutoff = new Date(Date.now() - feeds.historyDays * 86400000).toISOString().slice(0, 10)
    for (const f of await readdir(join(DATA, 'history'))) {
      if (f.replace('.json', '') < cutoff) await rm(join(DATA, 'history', f))
    }
  }

  console.log(`✓ ${date}: ${candidates.length} 篇候选 -> ${picked.length} 篇推荐 (已见过 ${seen.size} 篇)`)
  if (notes.length) console.log(notes.map((n) => `  · ${n}`).join('\n'))
  for (const p of picked.slice(0, 5)) {
    console.log(`  [${p.score}] ${p.title.slice(0, 70)}`)
    console.log(`       ${p.matched.slice(0, 5).join(', ')}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
