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

/** What a fetcher can know. isNew is decided later, against seen.json. */
type Candidate = Omit<FeedPaper, 'isNew'>

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
  origin: 'topic' | 'sweep',
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

  const score =
    coreHits.length * w.core +
    relatedHits.length * w.related +
    contextHits.length * w.context +
    inTitle.length * w.titleBonus +
    (origin === 'topic' ? w.topicBonus : w.sweepBonus)

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

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

/** One arXiv query -> scored papers. */
async function queryArxiv(
  searchQuery: string,
  max: number,
  origin: 'topic' | 'sweep',
): Promise<Candidate[]> {
  // https, not http: http 301-redirects.
  const url =
    `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(searchQuery)}` +
    `&sortBy=submittedDate&sortOrder=descending&start=0&max_results=${max}`

  const xml = await getWithRetry(url)
  if (!xml) {
    notes.push(`arXiv 查询失败: ${searchQuery}`)
    return []
  }

  const entries: AtomEntry[] = arr(parser.parse(xml)?.feed?.entry)
  const out: Candidate[] = []

  for (const e of entries) {
    const title = clean(e.title)
    const abstract = clean(e.summary)
    if (!title) continue

    const verdict = judge(title, abstract, origin)
    if (!verdict) continue

    // '2607.13808v1' -> '2607.13808'. Dedup must ignore the version, or a v2
    // re-announcement resurfaces a paper already seen.
    const id = (String(e.id ?? '').split('/abs/')[1] ?? '').replace(/v\d+$/, '')
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
      categories: arr(e.category)
        .map((c) => c['@_term'])
        .filter((c): c is string => !!c),
      matched: verdict.matched,
      score: verdict.score,
      comment: clean(
        typeof e['arxiv:comment'] === 'string' ? e['arxiv:comment'] : e['arxiv:comment']?.['#text'],
      ),
    })
  }
  return out
}

/**
 * Two passes, because a single combined category query does not work.
 *
 * Measured: `cat:cs.GR OR cat:cs.CV OR cat:cs.HC` sorted by date returns 112
 * cs.CV papers and 1 cs.GR paper per 150 — the home category is starved to
 * 0.7% and the window covers only ~28 hours. Sweeping cs.CV directly is no
 * better: at ~200 papers/day, finding its foveated papers would take thousands
 * of results.
 *
 * So: let arXiv filter the big categories server-side by topic, and sweep only
 * the small home category in full.
 */
async function fetchArxiv(): Promise<Candidate[]> {
  const byId = new Map<string, Candidate>()
  let first = true

  const add = (papers: Candidate[]) => {
    for (const p of papers) {
      // The same paper can match several topic queries; keep the best score.
      const prior = byId.get(p.id)
      if (!prior || p.score > prior.score) byId.set(p.id, p)
    }
  }

  for (const q of feeds.topicQueries) {
    // arXiv's manual asks for ~3s between sequential calls.
    if (!first) await sleep(3200)
    first = false
    add(await queryArxiv(q, feeds.perTopic, 'topic'))
  }

  for (const cat of feeds.sweepCategories) {
    if (!first) await sleep(3200)
    first = false
    add(await queryArxiv(`cat:${cat}`, feeds.perSweep, 'sweep'))
  }

  return [...byId.values()]
}

// ---- OpenAlex (fallback) ----

async function fetchOpenAlex(): Promise<Candidate[]> {
  // Only the strongest keywords: OpenAlex search is broad and this is a backup.
  const q = encodeURIComponent('foveated rendering OR gaze-contingent rendering OR perceptual rendering')
  const url =
    `https://api.openalex.org/works?search=${q}` +
    `&per-page=50&sort=publication_date:desc&mailto=zzxzzk115@gmail.com`

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
  const out: Candidate[] = []

  for (const w of results) {
    const title = clean(w.title)
    if (!title) continue
    const abstract = deInvert(w.abstract_inverted_index)
    // 'topic': the OpenAlex query is itself a topic search, same as arXiv's.
    const verdict = judge(title, abstract, 'topic')
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
  // --dry: score and print, write nothing and do not consume the seen set.
  // Tuning config/feeds.ts is guesswork without being able to see the ranking.
  const dry = process.argv.includes('--dry')
  const date = todayKey()
  if (!dry) await mkdir(join(DATA, 'history'), { recursive: true })

  // id -> date first seen. A set that permanently excludes would blank the page
  // for weeks: the field produces only a few arXiv papers a month.
  const seenPath = join(DATA, 'seen.json')
  const firstSeen: Record<string, string> = dry
    ? {}
    : await readFile(seenPath, 'utf8')
        .then((t) => JSON.parse(t) as Record<string, string>)
        .catch(() => ({}))

  let candidates = await fetchArxiv()
  if (candidates.length === 0) {
    notes.push('arXiv 无结果，回退到 OpenAlex')
    candidates = await fetchOpenAlex()
  }

  const cutoff = new Date(Date.now() - feeds.recentDays * 86400000).toISOString().slice(0, 10)
  const recent = candidates.filter((p) => p.published >= cutoff)
  if (candidates.length > recent.length) {
    notes.push(`${candidates.length} 篇候选，其中 ${recent.length} 篇在最近 ${feeds.recentDays} 天内`)
  }

  const ranked = recent
    .map((p) => ({ ...p, isNew: !firstSeen[p.id] }))
    .sort((a, b) => b.score - a.score || b.published.localeCompare(a.published))

  const picked = ranked.slice(0, feeds.dailyLimit)
  if (ranked.length > picked.length) {
    // Say what was dropped: a silent cut reads as "this was everything".
    notes.push(`${ranked.length} 篇符合条件，按分数取前 ${picked.length} 篇`)
  }
  const newCount = picked.filter((p) => p.isNew).length
  if (!dry && newCount > 0) notes.push(`其中 ${newCount} 篇是首次出现`)

  if (picked.length === 0 && candidates.length === 0) {
    // Keep the previous latest.json rather than publish an empty feed — a
    // provider outage must not look like a quiet day, and must not blank the page.
    console.error('✗ 所有来源都没拿到数据，保留上一次的 latest.json')
    console.error(notes.map((n) => `  ${n}`).join('\n'))
    process.exit(0)
  }

  if (dry) {
    console.log(`\n${date} 试运行：${candidates.length} 篇候选 -> ${recent.length} 篇在窗口内 -> 取前 ${picked.length} 篇\n`)
    for (const [i, p] of picked.entries()) {
      console.log(`${String(i + 1).padStart(2)}. [${String(p.score).padStart(3)}] ${p.title}`)
      console.log(`      ${p.categories.join(' ')}  ${p.published}`)
      console.log(`      命中: ${p.matched.join(', ') || '(仅靠分类扫描)'}`)
    }
    const cut = ranked.slice(picked.length, picked.length + 5)
    if (cut.length) {
      console.log(`\n--- 落选的前几篇（供调阈值参考）---`)
      for (const p of cut) console.log(`    [${String(p.score).padStart(3)}] ${p.title.slice(0, 70)}`)
    }
    if (notes.length) console.log(`\n备注:\n${notes.map((n) => `  · ${n}`).join('\n')}`)
    return
  }

  for (const p of picked) firstSeen[p.id] ??= date

  const file = FeedFile.parse({ date, papers: picked, notes })
  await writeFile(join(DATA, 'latest.json'), JSON.stringify(file, null, 2))
  await writeFile(join(DATA, 'history', `${date}.json`), JSON.stringify(file, null, 2))
  await writeFile(seenPath, JSON.stringify(firstSeen, null, 0))

  if (feeds.historyDays > 0) {
    const cutoff = new Date(Date.now() - feeds.historyDays * 86400000).toISOString().slice(0, 10)
    for (const f of await readdir(join(DATA, 'history'))) {
      if (f.replace('.json', '') < cutoff) await rm(join(DATA, 'history', f))
    }
  }

  console.log(
    `✓ ${date}: ${candidates.length} 篇候选 -> ${picked.length} 篇推荐 (${newCount} 篇新, 累计见过 ${Object.keys(firstSeen).length} 篇)`,
  )
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
