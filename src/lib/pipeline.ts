import type { Root as HastRoot, Element } from 'hast'
import type { Root as MdastRoot } from 'mdast'
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
import type { TocEntry } from './schema'

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

declare module 'vfile' {
  interface DataMap {
    toc: TocEntry[]
    text: string
    /** id of the Nth heading in document order — lets mdast-stage plugins
     *  resolve a heading anchor by index without reimplementing rehype-slug. */
    headingIds: string[]
  }
}

/** Grabs the plain text of the whole document for the search index + word count. */
function collectText() {
  return (tree: MdastRoot, file: VFile) => {
    file.data.text = mdastToString(tree)
  }
}

/**
 * Reads heading ids straight out of the tree rehype-slug just annotated.
 * Deliberately not a second github-slugger instance: reproducing rehype-slug's
 * output (including its `-1` dedupe suffixes) byte-for-byte is a standing
 * drift risk, and reading the real ids cannot drift at all.
 *
 * Must run after rehype-slug and before rehype-autolink-headings, which wraps
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
      toc.push({
        depth: Number(node.tagName.slice(1)),
        text: hastText(node),
        id,
      })
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

export function createProcessor() {
  return (
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      // Must precede any plugin consuming ::: blocks — it is what turns them
      // into directive nodes in the first place.
      .use(remarkDirective)
      .use(collectText)
      .use(remarkMath)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeSlug)
      .use(collectHeadings)
      .use(rehypeAutolinkHeadings, { behavior: 'wrap' })
      .use(rehypeKatex)
      .use(rehypePrettyCode, {
        theme: { light: 'github-light', dark: 'github-dark' },
        keepBackground: false,
      })
      .use(rehypeStringify, { allowDangerousHtml: true })
  )
}

export interface Rendered {
  html: string
  text: string
  toc: TocEntry[]
  headingIds: string[]
}

export async function render(markdown: string): Promise<Rendered> {
  const file = await createProcessor().process(markdown)
  return {
    html: String(file),
    text: file.data.text ?? '',
    toc: file.data.toc ?? [],
    headingIds: file.data.headingIds ?? [],
  }
}

/** CJK has no spaces, so a whitespace split undercounts Chinese prose badly. */
export function countWords(text: string): number {
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) ?? []).length
  const latin = (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).length
  return cjk + latin
}
