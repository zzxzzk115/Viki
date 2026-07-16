/**
 * Builds the in-library citation subgraph from OpenAlex and writes it to the
 * data branch (data/citations/), same as the arXiv feed: it is external-API
 * derived, changes rarely, and must not add commits to master's history.
 *
 * For each paper: resolve it to an OpenAlex work (by DOI, or by title search for
 * grey literature with no DOI), read its `referenced_works`. An edge A→B exists
 * when A's referenced_works contains B's OpenAlex id AND B is in the library.
 *
 * A paper that resolves to nothing (a GDC talk OpenAlex has never indexed) is
 * still a node — it just has no citation edges and floats to its tag cluster.
 *
 * Slow (network) and run on demand, not in every build. Caches raw OpenAlex
 * responses so adding one paper only queries that paper.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import fg from 'fast-glob'
import matter from 'gray-matter'

const ROOT = process.cwd()
const PAPERS = join(ROOT, 'content', 'papers')
const DATA = join(ROOT, 'data', 'citations')
const UA = 'Viki/1.0 (https://github.com/zzxzzk115/Viki; mailto:zzxzzk115@gmail.com)'
const SELECT = 'id,doi,title,referenced_works,cited_by_count'

const notes: string[] = []
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getJson(url: string, tries = 4): Promise<unknown | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })
      if (r.ok) return await r.json()
      if (r.status === 429 || r.status >= 500) {
        await sleep(2 ** i * 2000)
        continue
      }
      notes.push(`OpenAlex ${r.status}: ${url.slice(0, 80)}`)
      return null
    } catch {
      await sleep(2 ** i * 2000)
    }
  }
  return null
}

const oaId = (url: string) => url.replace('https://openalex.org/', '')
const normDoi = (d: string) => d.replace(/^https?:\/\/doi\.org\//i, '').toLowerCase()
const normTitle = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, ' ')
    .trim()

interface Paper {
  slug: string // 'papers/<name>'
  title: string
  doi?: string
}

interface Resolved {
  openalexId: string
  referencedWorks: string[]
  citedBy: number
  resolvedBy: 'doi' | 'title'
}

/** Guards title-search against matching an unrelated paper. */
function titleMatches(a: string, b: string): boolean {
  const wa = new Set(normTitle(a).split(' ').filter((w) => w.length > 2))
  const wb = new Set(normTitle(b).split(' ').filter((w) => w.length > 2))
  if (wa.size === 0) return false
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  return shared / Math.min(wa.size, wb.size) >= 0.6
}

async function main() {
  await mkdir(DATA, { recursive: true })

  const files = await fg('*.md', { cwd: PAPERS, absolute: true })
  const papers: Paper[] = []
  for (const f of files) {
    const { data } = matter(await readFile(f, 'utf8'))
    papers.push({
      slug: `papers/${basename(f, '.md')}`,
      title: String(data.title ?? ''),
      doi: data.doi ? normDoi(String(data.doi)) : undefined,
    })
  }

  // Reuse cached OpenAlex lookups; only query papers not yet resolved.
  const cachePath = join(DATA, 'cache.json')
  const cache: Record<string, Resolved> = await readFile(cachePath, 'utf8')
    .then((t) => JSON.parse(t) as Record<string, Resolved>)
    .catch(() => ({}))

  // --- DOI batch (one request per 50) ---
  const needDoi = papers.filter((p) => p.doi && !cache[p.slug])
  const byDoi = new Map(needDoi.map((p) => [p.doi!, p.slug]))
  for (let i = 0; i < needDoi.length; i += 50) {
    const batch = needDoi.slice(i, i + 50)
    const filter = `doi:${batch.map((p) => p.doi).join('|')}`
    const url = `https://api.openalex.org/works?filter=${encodeURIComponent(filter)}&select=${SELECT}&per-page=50&mailto=zzxzzk115@gmail.com`
    const json = (await getJson(url)) as { results?: OaWork[] } | null
    for (const w of json?.results ?? []) {
      const slug = w.doi ? byDoi.get(normDoi(w.doi)) : undefined
      if (!slug) continue
      cache[slug] = {
        openalexId: oaId(w.id),
        referencedWorks: (w.referenced_works ?? []).map(oaId),
        citedBy: w.cited_by_count ?? 0,
        resolvedBy: 'doi',
      }
    }
    if (i + 50 < needDoi.length) await sleep(1200)
  }

  // --- Title search: grey lit with no DOI, AND papers whose DOI OpenAlex does
  // not index (e.g. Eurographics 10.2312/... DOIs). Anything still unresolved. ---
  const needTitle = papers.filter((p) => !cache[p.slug])
  for (const p of needTitle) {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(p.title)}&select=${SELECT}&per-page=5&mailto=zzxzzk115@gmail.com`
    const json = (await getJson(url)) as { results?: OaWork[] } | null
    const hit = (json?.results ?? []).find((w) => titleMatches(p.title, w.title ?? ''))
    if (hit) {
      cache[p.slug] = {
        openalexId: oaId(hit.id),
        referencedWorks: (hit.referenced_works ?? []).map(oaId),
        citedBy: hit.cited_by_count ?? 0,
        resolvedBy: 'title',
      }
    } else {
      notes.push(`未在 OpenAlex 找到（无引用边，仅作节点）: ${p.slug}`)
    }
    await sleep(1200)
  }

  await writeFile(cachePath, JSON.stringify(cache, null, 0))

  // --- Build the in-library edge set ---
  const idToSlug = new Map<string, string>()
  for (const p of papers) {
    const r = cache[p.slug]
    if (r) idToSlug.set(r.openalexId, p.slug)
  }

  const edges: { source: string; target: string }[] = []
  const seen = new Set<string>()
  for (const p of papers) {
    const r = cache[p.slug]
    if (!r) continue
    for (const ref of r.referencedWorks) {
      const target = idToSlug.get(ref)
      if (!target || target === p.slug) continue
      const key = `${p.slug}->${target}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ source: p.slug, target })
    }
  }

  const citedBy: Record<string, number> = {}
  for (const p of papers) if (cache[p.slug]) citedBy[p.slug] = cache[p.slug].citedBy

  const resolved = papers.filter((p) => cache[p.slug]).length
  const out = {
    fetchedAt: new Date().toISOString().slice(0, 10),
    edges,
    citedBy,
    unresolved: papers.filter((p) => !cache[p.slug]).map((p) => p.slug),
    notes,
  }
  await writeFile(join(DATA, 'edges.json'), JSON.stringify(out, null, 2))

  console.log(
    `✓ ${papers.length} 篇论文 → OpenAlex 解析 ${resolved} 篇 → 库内引用边 ${edges.length} 条`,
  )
  if (out.unresolved.length) console.log(`  未解析 (仅节点): ${out.unresolved.join(', ')}`)
  if (notes.length) console.log(notes.map((n) => `  · ${n}`).join('\n'))
}

interface OaWork {
  id: string
  doi?: string
  title?: string
  referenced_works?: string[]
  cited_by_count?: number
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
