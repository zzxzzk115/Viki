import type { Root, RootContent } from 'mdast'
import type { VFile } from 'vfile'
import { visitParents } from 'unist-util-visit-parents'
import type { Glossary } from '@/lib/schema'

/**
 * `:term[辐射亮度]` -> 辐射亮度 (radiance), looked up in content/_glossary.yml.
 *
 * The glossary is the single source of truth for translations, so a term cannot
 * drift between 辐射亮度 and 辐射率 across notes. An unknown term fails the
 * build — unlike a wiki-link, where rot should stay visible but non-fatal, a
 * missing translation is a typo against a closed vocabulary and there is
 * nothing sensible to render.
 *
 * The English is emitted on the FIRST use per document only; later uses render
 * as the Chinese alone, with the definition still on hover. A term used ten
 * times would otherwise read as noise.
 *
 * Terms inside a ::::card always get the English, regardless of first-use.
 * A card is reviewed standalone — the reader never sees the prose that
 * introduced the term — so inheriting the document's first-use state would
 * strip the English from exactly the place that needs it most.
 *
 * Attributes:
 *   :term[辐射亮度]{as=亮度}   display 亮度 while still resolving 辐射亮度
 *   :term[辐射亮度]{en}        force the English anywhere
 */

declare module 'vfile' {
  interface DataMap {
    /** Glossary keys used in this document, in first-use order. */
    terms: string[]
    /** Terms referenced but absent from the glossary. */
    unknownTerms: string[]
  }
}

export interface TermsOptions {
  glossary: Glossary
}

interface TextDirective {
  type: string
  name?: string
  attributes?: Record<string, string | null | undefined> | null
  children?: RootContent[]
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

export function remarkTerms({ glossary }: TermsOptions) {
  return (tree: Root, file: VFile) => {
    const used: string[] = []
    const unknown: string[] = []
    const annotated = new Set<string>()

    visitParents(tree, (node, ancestors) => {
      const n = node as TextDirective
      if (n.type !== 'textDirective' || n.name !== 'term') return

      const inCard = ancestors.some(
        (a) => (a as TextDirective).type === 'containerDirective' && (a as TextDirective).name === 'card',
      )

      const key = textOf(n.children ?? []).trim()
      if (!key) {
        unknown.push('(空的 :term[])')
        return
      }

      const entry = glossary[key]
      if (!entry) {
        unknown.push(key)
        return
      }

      if (!used.includes(key)) used.push(key)

      const display = n.attributes?.as?.trim() || key
      // A valueless `{en}` parses to '' rather than undefined, so presence is
      // what matters, not truthiness.
      const forced = n.attributes?.en !== undefined && n.attributes?.en !== null
      const withEnglish = forced || inCard || !annotated.has(key)
      // Card uses do not consume the document's first-use slot: the prose
      // should still introduce the term properly on its own first mention.
      if (!inCard) annotated.add(key)

      // 最小可分辨角 (minimum angle of resolution, MAR) — the abbreviation is
      // what the literature actually uses, so it has to be on the page.
      const english = entry.abbr ? `${entry.en}, ${entry.abbr}` : entry.en

      n.data = {
        hName: 'span',
        hProperties: {
          className: ['term'],
          'data-term': key,
          title: entry.def ? `${english} — ${entry.def}` : english,
        },
      }
      n.children = withEnglish
        ? [
            { type: 'text', value: display },
            {
              type: 'emphasis',
              data: { hName: 'span', hProperties: { className: ['term-en'] } },
              children: [{ type: 'text', value: ` (${english})` }],
            } as unknown as RootContent,
          ]
        : [{ type: 'text', value: display }]
    })

    file.data.terms = used
    file.data.unknownTerms = unknown
  }
}

function textOf(nodes: RootContent[]): string {
  let out = ''
  for (const n of nodes) {
    if ('value' in n && typeof n.value === 'string') out += n.value
    else if ('children' in n && Array.isArray(n.children)) out += textOf(n.children as RootContent[])
  }
  return out
}
