import type { Element, Root } from 'hast'
import { visit } from 'unist-util-visit'

/**
 * Prefixes basePath onto every root-relative href/src in rendered note HTML.
 *
 * Next applies basePath to next/link and next/image, but note bodies are
 * injected with dangerouslySetInnerHTML — Next never sees those attributes, so
 * a `/notes/foo/` href reaches the browser verbatim and 404s on Pages, where
 * the site is served under /Viki.
 *
 * Doing it here rather than at each href's source means wiki-links, plain
 * markdown links and images are all covered, and nothing new has to remember
 * the rule. The failure it prevents is silent: the link renders fine and only
 * 404s when clicked.
 */

const ATTRS = ['href', 'src'] as const

export interface BasePathOptions {
  /** Mirror of `basePath` in next.config.ts. '' disables the plugin. */
  base: string
}

export function rehypeBasePath({ base }: BasePathOptions) {
  return (tree: Root) => {
    if (!base) return
    visit(tree, 'element', (node: Element) => {
      if (!node.properties) return
      for (const attr of ATTRS) {
        const v = node.properties[attr]
        if (typeof v !== 'string') continue
        // Only root-relative site paths: skip '#anchor', 'https://…',
        // '//cdn…' (protocol-relative), and anything already prefixed.
        if (!v.startsWith('/')) continue
        if (v.startsWith('//')) continue
        if (v === base || v.startsWith(`${base}/`)) continue
        node.properties[attr] = `${base}${v}`
      }
    })
  }
}
