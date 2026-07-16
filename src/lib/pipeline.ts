import type { Root as HastRoot, Element } from 'hast'
import type { Root as MdastRoot, RootContent } from 'mdast'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeKatex from 'rehype-katex'
import rehypePrettyCode from 'rehype-pretty-code'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { toString as mdastToString } from 'mdast-util-to-string'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import type { VFile } from 'vfile'
import { rehypeBasePath } from '@/plugins/rehype-base-path'
import { remarkCards, type RawCard } from '@/plugins/remark-cards'
import { remarkWikilink, type WikilinkOptions } from '@/plugins/remark-wikilink'
import type { TocEntry } from './schema'

/**
 * Mirror of `basePath` in next.config.ts. Note HTML is injected with
 * dangerouslySetInnerHTML, so Next never applies basePath to the hrefs inside
 * it — rehypeBasePath does it here instead.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '/Viki'

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

declare module 'vfile' {
  interface DataMap {
    toc: TocEntry[]
    text: string
    /** id of the Nth heading in document order, so mdast-stage plugins can
     *  resolve an anchor by index instead of reimplementing rehype-slug. */
    headingIds: string[]
  }
}

/** Plain text of the whole document, for the search index and word count. */
function collectText() {
  return (tree: MdastRoot, file: VFile) => {
    file.data.text = mdastToString(tree)
  }
}

/**
 * Reads heading ids straight out of the tree rehype-slug just annotated.
 * Deliberately not a second github-slugger: reproducing rehype-slug's output
 * (including its `-1` dedupe suffixes) byte-for-byte is a standing drift risk,
 * and reading the real ids cannot drift.
 *
 * Runs after rehype-slug and before rehype-autolink-headings, which wraps
 * heading children in an <a> and would pollute the extracted text.
 */
function collectHeadings() {
  return (tree: HastRoot, file: VFile) => {
    const toc: TocEntry[] = []
    const ids: string[] = []
    visit(tree, 'element', (node: Element) => {
      if (!HEADINGS.has(node.tagName)) return
      const id = String(node.properties?.id ?? '')
      ids.push(id)
      toc.push({ depth: Number(node.tagName.slice(1)), text: hastText(node), id })
    })
    file.data.toc = toc
    file.data.headingIds = ids
  }
}

function hastText(node: Element): string {
  let out = ''
  visit(node, 'text', (t) => {
    out += t.value
  })
  return out.trim()
}

const SHIKI = {
  theme: { light: 'github-light', dark: 'github-dark' },
  keepBackground: false,
} as const

export interface RenderOptions {
  resolve: WikilinkOptions['resolve']
}

export function createProcessor(options: RenderOptions) {
  return (
    unified()
      .use(remarkParse)
      // gfm/math/directive are parser extensions, so their nodes exist before
      // any transformer runs — remarkCards sees math and code inside cards
      // regardless of where these sit in the chain.
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkDirective)
      .use(collectText)
      .use(remarkCards)
      .use(remarkWikilink, options)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeSlug)
      .use(collectHeadings)
      .use(rehypeAutolinkHeadings, { behavior: 'wrap' })
      .use(rehypeKatex)
      .use(rehypePrettyCode, SHIKI)
      .use(rehypeBasePath, { base: BASE })
      .use(rehypeStringify, { allowDangerousHtml: true })
  )
}

/**
 * Renders a captured card subtree through the same rehype tail as the note
 * body, so cards get KaTeX and shiki without remark-cards knowing they exist.
 */
const fragmentProcessor = unified()
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeKatex)
  .use(rehypePrettyCode, SHIKI)
  // Cards can hold wiki-links too — remarkWikilink has already rewritten the
  // captured subtree in place by the time this runs.
  .use(rehypeBasePath, { base: BASE })
  .use(rehypeStringify, { allowDangerousHtml: true })

export async function renderFragment(nodes: RootContent[]): Promise<string> {
  const root: MdastRoot = { type: 'root', children: nodes }
  const hast = await fragmentProcessor.run(root)
  return fragmentProcessor.stringify(hast) as string
}

export interface Rendered {
  html: string
  text: string
  toc: TocEntry[]
  headingIds: string[]
  cards: RawCard[]
  cardErrors: string[]
  links: string[]
  brokenLinks: string[]
}

export async function render(markdown: string, options: RenderOptions): Promise<Rendered> {
  const file = await createProcessor(options).process(markdown)
  return {
    html: String(file),
    text: file.data.text ?? '',
    toc: file.data.toc ?? [],
    headingIds: file.data.headingIds ?? [],
    cards: file.data.cards ?? [],
    cardErrors: file.data.cardErrors ?? [],
    links: file.data.links ?? [],
    brokenLinks: file.data.brokenLinks ?? [],
  }
}

/** CJK has no spaces, so a whitespace split undercounts Chinese prose badly. */
export function countWords(text: string): number {
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) ?? []).length
  const latin = (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).length
  return cjk + latin
}
