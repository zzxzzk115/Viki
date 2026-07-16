import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { rehypeBasePath } from '@/plugins/rehype-base-path'
import { remarkCards } from '@/plugins/remark-cards'
import { remarkArray, remarkDemo } from '@/plugins/remark-demo'
import { remarkTerms } from '@/plugins/remark-terms'
import { remarkWikilink } from '@/plugins/remark-wikilink'
import type { Glossary } from './schema'

/**
 * In-browser preview for the editor. Deliberately the site's own remark plugins
 * (cards, demos, terms, wiki-links, KaTeX) so the preview is honest — the one
 * divergence is code highlighting: shiki is a build-time dependency measured in
 * megabytes, so preview code blocks render plain. The real pipeline stays the
 * source of truth; this approximates it.
 *
 * Loaded only by the /editor route, so KaTeX's JS rides that chunk alone and
 * never taxes the rest of the site.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '/Viki'

export interface PreviewContext {
  glossary: Glossary
  /** slug -> href/title, from public/data/titles.json. */
  titles: Record<string, { title: string; href: string }>
}

export function createPreview(ctx: PreviewContext) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkTerms, { glossary: ctx.glossary })
    .use(remarkDemo)
    .use(remarkArray)
    .use(remarkCards)
    .use(remarkWikilink, {
      resolve: (target: string) => {
        const hit = ctx.titles[target]
        return hit ? { href: hit.href, title: hit.title } : null
      },
    })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeKatex)
    .use(rehypeBasePath, { base: BASE })
    .use(rehypeStringify, { allowDangerousHtml: true })

  return async (markdown: string): Promise<string> => {
    // A KaTeX parse error on half-typed math must not kill the preview loop.
    try {
      return String(await processor.process(markdown))
    } catch (e) {
      return `<p class="wikilink-broken">预览渲染失败: ${e instanceof Error ? e.message : String(e)}</p>`
    }
  }
}
