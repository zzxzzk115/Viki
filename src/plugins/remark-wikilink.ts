import type { Parent, Root, RootContent, Text } from 'mdast'
import type { VFile } from 'vfile'
import { visit } from 'unist-util-visit'

/**
 * [[slug]] and [[slug|别名]] -> links, plus a record of outgoing edges.
 *
 * Worth having despite being small: the cost of skipping it is not the plugin,
 * it is that hundreds of notes get authored with brittle relative paths and
 * retrofitting means rewriting all of them. Link syntax is the one decision
 * with content-migration cost.
 *
 * An unresolved target renders red rather than failing the build. Link rot
 * should be visible, not fatal — a knowledge base you cannot build because you
 * renamed a file is one you stop writing in.
 */

const PATTERN = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g

declare module 'vfile' {
  interface DataMap {
    /** Resolved slugs this document links to; deduped, source order. */
    links: string[]
    /** Targets that resolved to nothing — surfaced in build output as a warning. */
    brokenLinks: string[]
  }
}

export interface WikilinkOptions {
  /** Returns the resolved note, or null when the target does not exist. */
  resolve: (target: string) => { href: string; title: string } | null
}

export function remarkWikilink(options: WikilinkOptions) {
  return (tree: Root, file: VFile) => {
    const links = new Set<string>()
    const broken: string[] = []

    visit(tree, 'text', (node: Text, index, parent: Parent | undefined) => {
      if (!parent || index === undefined) return
      // Inside a link, [[…]] is literal text — nesting links is invalid HTML.
      if (parent.type === 'link' || parent.type === 'linkReference') return
      if (!node.value.includes('[[')) return

      const out: RootContent[] = []
      let last = 0
      PATTERN.lastIndex = 0

      for (let m = PATTERN.exec(node.value); m; m = PATTERN.exec(node.value)) {
        const [raw, rawTarget, alias] = m
        const target = rawTarget.trim()
        if (m.index > last) {
          out.push({ type: 'text', value: node.value.slice(last, m.index) })
        }
        const hit = options.resolve(target)
        if (hit) {
          links.add(target)
          out.push({
            type: 'link',
            url: hit.href,
            title: null,
            data: { hProperties: { className: ['wikilink'] } },
            children: [{ type: 'text', value: alias?.trim() || hit.title }],
          })
        } else {
          broken.push(target)
          out.push({
            type: 'emphasis',
            data: {
              hName: 'span',
              hProperties: { className: ['wikilink-broken'], title: `找不到笔记: ${target}` },
            },
            children: [{ type: 'text', value: alias?.trim() || target }],
          })
        }
        last = m.index + raw.length
      }

      if (out.length === 0) return
      if (last < node.value.length) {
        out.push({ type: 'text', value: node.value.slice(last) })
      }
      parent.children.splice(index, 1, ...out)
      // Skip the nodes just inserted.
      return index + out.length
    })

    file.data.links = [...links]
    file.data.brokenLinks = broken
  }
}
