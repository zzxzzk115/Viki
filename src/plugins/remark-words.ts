import type { BlockContent, DefinitionContent, Root, RootContent } from 'mdast'
import { toString as mdastToString } from 'mdast-util-to-string'
import type { VFile } from 'vfile'
import { visit } from 'unist-util-visit'

/**
 * Extracts ::::word / :::meaning / :::example blocks into a vocabulary index,
 * and rewrites them so the note body still renders the word inline.
 *
 * Syntax (see CONTRIBUTING.md):
 *
 *   ::::word{ipa="/əˈbændən/" pos=v}
 *   abandon
 *
 *   :::meaning
 *   放弃，抛弃
 *   :::
 *
 *   :::example
 *   He abandoned his car in the snow.
 *   :::
 *   ::::
 *
 * Deliberately a DIFFERENT directive from ::::card: separation is by directive
 * name, so word cards never leak into cards.json / the knowledge-card review
 * pile (build-content only special-cases the `papers` subject, otherwise every
 * ::::card goes to cards.json regardless of subject).
 *
 * Like remark-cards, this only CAPTURES the meaning/example subtrees; rendering
 * runs through the same processor in build-content, so KaTeX and shiki work.
 */

export interface RawWord {
  explicitId?: string
  headingIndex: number
  /** Plain-text headword (source-derived, drives the id hash). */
  word: string
  ipa?: string
  pos?: string
  meaning: RootContent[]
  example?: RootContent[]
}

declare module 'vfile' {
  interface DataMap {
    words: RawWord[]
    wordErrors: string[]
  }
}

type Container = {
  type: string
  name?: string
  attributes?: Record<string, string | null | undefined> | null
  children?: RootContent[]
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

export function remarkWords() {
  return (tree: Root, file: VFile) => {
    const words: RawWord[] = []
    const errors: string[] = []
    let headingIndex = -1

    visit(tree, (node) => {
      if (node.type === 'heading') headingIndex++

      const n = node as Container
      if (n.type !== 'containerDirective' || n.name !== 'word') return

      const kids = (n.children ?? []) as RootContent[]
      const meaningNode = kids.find(
        (c) => (c as Container).type === 'containerDirective' && (c as Container).name === 'meaning',
      ) as Container | undefined
      const exampleNode = kids.find(
        (c) => (c as Container).type === 'containerDirective' && (c as Container).name === 'example',
      ) as Container | undefined

      if (!meaningNode) {
        errors.push('::::word 里缺少 :::meaning 块')
        return
      }

      // The headword is whatever text is not the meaning/example directives.
      const headParts = kids.filter(
        (c) => c !== (meaningNode as unknown as RootContent) && c !== (exampleNode as unknown as RootContent),
      )
      const word = mdastToString({ type: 'root', children: headParts } as Root).trim()
      if (!word) {
        errors.push('::::word 里没有单词（:::meaning 之前应有一行单词）')
        return
      }

      words.push({
        explicitId: n.attributes?.id ?? undefined,
        headingIndex,
        word,
        ipa: n.attributes?.ipa ?? undefined,
        pos: n.attributes?.pos ?? undefined,
        meaning: (meaningNode.children ?? []) as RootContent[],
        example: exampleNode ? ((exampleNode.children ?? []) as RootContent[]) : undefined,
      })

      // Rewrite for inline rendering as a small vocab entry.
      const ipa = n.attributes?.ipa
      const pos = n.attributes?.pos
      const headChildren: RootContent[] = [
        { type: 'strong', children: [{ type: 'text', value: word }] } as unknown as RootContent,
      ]
      if (ipa) headChildren.push({ type: 'text', value: `  ${ipa}` } as RootContent)
      if (pos) headChildren.push({ type: 'emphasis', children: [{ type: 'text', value: `  ${pos}.` }] } as unknown as RootContent)

      meaningNode.data = { hName: 'div', hProperties: { className: ['vocab-meaning'] } }
      if (exampleNode) exampleNode.data = { hName: 'div', hProperties: { className: ['vocab-example'] } }

      n.data = { hName: 'div', hProperties: { className: ['vocab-card'] } }
      n.children = [
        {
          type: 'paragraph',
          data: { hName: 'div', hProperties: { className: ['vocab-head'] } },
          children: headChildren as (BlockContent | DefinitionContent)[],
        } as unknown as RootContent,
        meaningNode as unknown as RootContent,
        ...(exampleNode ? [exampleNode as unknown as RootContent] : []),
      ]
    })

    file.data.words = words
    file.data.wordErrors = errors
  }
}
