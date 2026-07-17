/**
 * OpenAlex abstract lookup for the AI brief. OpenAlex sends CORS headers and
 * needs no key — the same reason the citation graph is built on it.
 */

const API = 'https://api.openalex.org'
const MAILTO = 'zzxzzk115@gmail.com' // polite pool

/**
 * OpenAlex stores abstracts as an inverted index (word -> positions) for
 * legal reasons; flattening it back is exact. Pure and unit-tested.
 */
export function invertAbstract(inv: Record<string, number[]> | null | undefined): string {
  if (!inv) return ''
  const words: string[] = []
  for (const [word, positions] of Object.entries(inv)) {
    for (const p of positions) words[p] = word
  }
  return words.filter(Boolean).join(' ')
}

export type AbstractResult =
  | { ok: true; abstract: string | null; source: 'doi' | 'title' | 'none' }
  | { ok: false; message: string }

const normTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '')

export async function fetchAbstract(ref: {
  doi?: string
  arxiv?: string
  title: string
}): Promise<AbstractResult> {
  // arXiv papers all carry this DOI form (buildArxivBibEntry writes it), but
  // synthesize it anyway for hand-written pages that only set `arxiv:`.
  const doi = ref.doi ?? (ref.arxiv ? `10.48550/arXiv.${ref.arxiv}` : undefined)

  try {
    if (doi) {
      const r = await fetch(
        `${API}/works/https://doi.org/${encodeURIComponent(doi)}?select=abstract_inverted_index&mailto=${MAILTO}`,
      )
      if (r.ok) {
        const j = (await r.json()) as { abstract_inverted_index?: Record<string, number[]> }
        const abstract = invertAbstract(j.abstract_inverted_index)
        if (abstract) return { ok: true, abstract, source: 'doi' }
      } else if (r.status !== 404) {
        return { ok: false, message: `OpenAlex HTTP ${r.status}` }
      }
    }

    // Title search fallback — only trusted when the title matches exactly
    // after normalization (search is fuzzy and the wrong paper's abstract is
    // worse than none).
    const q = encodeURIComponent(ref.title.slice(0, 300))
    const r = await fetch(
      `${API}/works?filter=title.search:${q}&select=title,abstract_inverted_index&per-page=1&mailto=${MAILTO}`,
    )
    if (r.ok) {
      const j = (await r.json()) as {
        results?: { title?: string; abstract_inverted_index?: Record<string, number[]> }[]
      }
      const hit = j.results?.[0]
      if (hit?.title && normTitle(hit.title) === normTitle(ref.title)) {
        const abstract = invertAbstract(hit.abstract_inverted_index)
        if (abstract) return { ok: true, abstract, source: 'title' }
      }
    }
    return { ok: true, abstract: null, source: 'none' }
  } catch {
    return { ok: false, message: '连不上 OpenAlex——网络问题，稍后重试' }
  }
}
