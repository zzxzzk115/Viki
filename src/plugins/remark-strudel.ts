import type { Root, RootContent } from 'mdast'
import type { VFile } from 'vfile'
import { visit } from 'unist-util-visit'

/**
 * ::::strudel — a live-coding music pattern (strudel.cc), embedded on demand.
 *
 *   ::::strudel{height=320}
 *   ```js
 *   note("c3 e3 g3 c4").sound("piano")
 *   ```
 *   ::::
 *
 * Like ::::shader, the code stays a visible highlighted block (readable with
 * JS off, searchable); StrudelPlayer adds a click-to-load iframe to the
 * strudel.cc REPL with the code in the URL hash (their share-link format).
 * An iframe rather than self-hosting: the Strudel runtime is a multi-MB
 * audio stack that has no business in this site's bundle — and click-to-load
 * means visitors who never press play never talk to strudel.cc at all.
 */

export interface StrudelInfo {
  source: string
  height: number
}

declare module 'vfile' {
  interface DataMap {
    strudels: StrudelInfo[]
    strudelErrors: string[]
  }
}

type Container = {
  type: string
  name?: string
  attributes?: Record<string, string | null | undefined> | null
  children?: RootContent[]
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

export function remarkStrudel() {
  return (tree: Root, file: VFile) => {
    const strudels: StrudelInfo[] = []
    const errors: string[] = []

    visit(tree, (node) => {
      const n = node as Container
      if (n.type !== 'containerDirective' || n.name !== 'strudel') return

      const code = (n.children ?? []).find((c) => c.type === 'code') as { value?: string } | undefined
      if (!code?.value) {
        errors.push('::::strudel 里缺少代码块（```js … ```）')
        return
      }
      const height = Math.max(120, Number(n.attributes?.height) || 300)
      strudels.push({ source: code.value, height })

      // Same base64 strudel.cc uses for share links — computed at build so the
      // client component only assembles an iframe.
      const hash = Buffer.from(code.value, 'utf8').toString('base64')
      n.data = {
        hName: 'div',
        hProperties: {
          className: ['strudel'],
          'data-strudel': hash,
          'data-height': String(height),
        },
      }
      // Keep only the code block child — stray prose inside would render as
      // part of the embed.
      n.children = (n.children ?? []).filter((c) => c === (code as unknown as RootContent))
    })

    file.data.strudels = strudels
    file.data.strudelErrors = errors
  }
}
