import type { Root, RootContent } from 'mdast'
import { visit } from 'unist-util-visit'

/**
 * :::gallery — a grid of images.
 *
 *   :::gallery
 *   ![管线概览](/img/pipeline.svg)
 *   ![延迟渲染](/img/deferred.svg)
 *   :::
 *
 * Pure layout: the images stay ordinary markdown images (basePath rewriting,
 * lazy loading and the lightbox all see them unchanged), the directive only
 * contributes the grid container. No options on purpose — column count is
 * responsive (auto-fill), and per-gallery knobs would be one more thing to
 * document for near-zero layout gain.
 */
export function remarkGallery() {
  return (tree: Root) => {
    visit(tree, (node) => {
      const n = node as { type: string; name?: string; data?: { hName?: string; hProperties?: Record<string, unknown> }; children?: RootContent[] }
      if (n.type !== 'containerDirective' || n.name !== 'gallery') return
      n.data = { hName: 'div', hProperties: { className: ['img-gallery'] } }
    })
  }
}
