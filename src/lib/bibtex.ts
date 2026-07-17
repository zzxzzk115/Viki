/**
 * BibTeX entry generation for the "加入待读" button: an arXiv feed paper is
 * appended to scratch/related-work.bib, and CI (import-papers.yml) runs the
 * same import-bibtex pipeline that seeded the library — the .bib stays the
 * single source of truth for imported papers.
 */

export interface ArxivPaperRef {
  /** Versionless arXiv id, e.g. '2510.03964'. */
  id: string
  title: string
  authors: string[]
  /** ISO date; only the year is used. */
  published: string
  url: string
}

/** Dots are legal in BibTeX keys but choke some tools — underscore is safe. */
export function arxivBibKey(id: string): string {
  return `arxiv${id.replace(/[^0-9a-zA-Z]/g, '_')}`
}

/** BibTeX-hostile characters; braces would also confuse our own parser. */
function bibEscape(s: string): string {
  return s
    .replace(/[{}\\]/g, ' ')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildArxivBibEntry(p: ArxivPaperRef): string {
  const year = p.published.slice(0, 4)
  const authors = p.authors.map(bibEscape).join(' and ')
  return [
    `@misc{${arxivBibKey(p.id)},`,
    `  title        = {${bibEscape(p.title)}},`,
    `  author       = {${authors}},`,
    `  year         = {${year}},`,
    `  eprint       = {${p.id}},`,
    `  archiveprefix = {arXiv},`,
    // howpublished feeds the importer's venue derivation -> 'arXiv <year>'.
    `  howpublished = {arXiv preprint arXiv:${p.id}},`,
    `  doi          = {10.48550/arXiv.${p.id}},`,
    `  url          = {${p.url}}`,
    `}`,
  ].join('\n')
}

/** Already in the .bib? Checked before appending so a double-click cannot
 *  duplicate the entry (the importer dedups pages, but the bib should stay
 *  clean too). */
export function bibHasArxivId(bib: string, id: string): boolean {
  return bib.includes(arxivBibKey(id)) || bib.includes(`arXiv.${id}`) || bib.includes(`eprint       = {${id}}`)
}

/** Append with exactly one blank line between entries. */
export function appendBibEntry(bib: string, entry: string): string {
  return `${bib.replace(/\s*$/, '')}\n\n${entry}\n`
}

/** doi.org prefixes and case variance make substring checks unreliable —
 *  normalize before comparing. */
export function normalizeDoi(doi: string): string {
  return doi
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
}

/**
 * Every DOI present in the .bib, extracted from `doi = {...}` fields (not
 * substring search: a DOI can legitimately appear inside a url field of a
 * DIFFERENT entry). Used by the Zotero importer for batch dedup.
 */
export function extractBibDois(bib: string): Set<string> {
  const out = new Set<string>()
  for (const m of bib.matchAll(/^\s*doi\s*=\s*[{"]([^}"]+)[}"]/gim) as Iterable<RegExpMatchArray>) {
    out.add(normalizeDoi(m[1]))
  }
  return out
}

export function bibHasDoi(bib: string, doi: string): boolean {
  return extractBibDois(bib).has(normalizeDoi(doi))
}

/**
 * Splits a multi-entry BibTeX string (e.g. a Zotero export) into individual
 * entries. Boundary = a line starting with '@' — braces inside field values
 * never start a line in generated BibTeX, so no brace counting is needed.
 */
export function splitBibEntries(bibtex: string): string[] {
  const out: string[] = []
  let current: string[] = []
  for (const line of bibtex.split('\n')) {
    if (/^\s*@/.test(line) && current.some((l) => l.trim() !== '')) {
      out.push(current.join('\n').trim())
      current = []
    }
    current.push(line)
  }
  const last = current.join('\n').trim()
  if (last.startsWith('@')) out.push(last)
  return out.filter((e) => e.startsWith('@'))
}
