import type { Element, Root } from 'hast'
import { visit } from 'unist-util-visit'

/**
 * Opens external links in a new tab so a click never navigates away from Viki.
 * Internal links (root-relative, resolved to /Viki/... by rehype-base-path, or
 * bare #anchors) keep default behavior — they are same-tab SPA navigation.
 *
 * rel="noopener noreferrer" is not optional on target=_blank: without noopener
 * the opened page can reach back through window.opener.
 */
export function rehypeExternalLinks() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'a') return
      const href = node.properties?.href
      if (typeof href !== 'string' || !/^https?:\/\//i.test(href)) return
      node.properties.target = '_blank'
      node.properties.rel = ['noopener', 'noreferrer']
    })
  }
}
