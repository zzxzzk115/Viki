import type { BlockContent, DefinitionContent, Root, RootContent } from 'mdast'
import { toString as mdastToString } from 'mdast-util-to-string'
import type { VFile } from 'vfile'
import { visit } from 'unist-util-visit'

/**
 * Extracts ::::card / :::answer blocks into a card index, and rewrites them so
 * the note body still renders the card inline.
 *
 * Syntax (see CONTRIBUTING.md):
 *
 *   ::::card{id=optional-stable-id}
 *   问题写在这里，可以有公式和代码
 *
 *   :::answer
 *   答案写在这里
 *   :::
 *   ::::
 *
 * The outer fence needs more colons than the inner one — that is remark-directive's
 * nesting rule, not a style choice.
 *
 * Deliberately not `Q:`/`A:` string parsing (breaks on math, code fences, Chinese
 * punctuation) and deliberately not a `---` separator (a line of `---` after text
 * parses as a setext h2, silently swallowing the question).
 *
 * This plugin only *captures* the question/answer mdast subtrees. Rendering them
 * happens in scripts/build-content.ts through the same processor as the note body,
 * so cards get KaTeX and shiki for free without this plugin knowing about either.
 */

export interface RawCard {
  /** Explicit {id=…}, or undefined to be content-hashed by the caller. */
  explicitId?: string
  /** Index of the nearest heading above the card, -1 if none precede it. */
  headingIndex: number
  question: RootContent[]
  answer: RootContent[]
  /**
   * Plain text of the question, straight from the markdown source.
   * The id hash must key off this, never off rendered HTML: KaTeX and shiki
   * output changes across their own version bumps, which would silently orphan
   * every card's review history on an unrelated dependency upgrade.
   */
  questionSource: string
  /** Authored multiple-choice options from the :::quiz block, correct first. */
  quiz?: { correct: RootContent[]; distractors: RootContent[][] }
}

declare module 'vfile' {
  interface DataMap {
    cards: RawCard[]
    cardErrors: string[]
  }
}

type Container = {
  type: string
  name?: string
  attributes?: Record<string, string | null | undefined> | null
  children?: RootContent[]
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

export function remarkCards() {
  return (tree: Root, file: VFile) => {
    const cards: RawCard[] = []
    const errors: string[] = []
    let headingIndex = -1

    visit(tree, (node) => {
      // visit walks in document order, so this counts the headings that precede
      // each card. The index is resolved against the real rehype-slug ids later
      // rather than re-slugging the heading text here.
      if (node.type === 'heading') headingIndex++

      const n = node as Container
      if (n.type !== 'containerDirective' || n.name !== 'card') return

      const kids = (n.children ?? []) as RootContent[]
      const answerNode = kids.find(
        (c) => (c as Container).type === 'containerDirective' && (c as Container).name === 'answer',
      ) as Container | undefined
      const quizNode = kids.find(
        (c) => (c as Container).type === 'containerDirective' && (c as Container).name === 'quiz',
      ) as Container | undefined

      if (!answerNode) {
        errors.push('::::card 里缺少 :::answer 块')
        return
      }
      const question = kids.filter(
        (c) => c !== (answerNode as unknown as RootContent) && c !== (quizNode as unknown as RootContent),
      )
      if (question.length === 0) {
        errors.push('::::card 里 :::answer 之前没有问题内容')
        return
      }

      let quiz: RawCard['quiz']
      if (quizNode) {
        const parsed = parseQuiz(quizNode)
        if (typeof parsed === 'string') {
          errors.push(`:::quiz（${mdastToString({ type: 'root', children: question } as Root).slice(0, 30)}…）${parsed}`)
          return
        }
        quiz = parsed
      }

      cards.push({
        explicitId: n.attributes?.id ?? undefined,
        headingIndex,
        question,
        answer: (answerNode.children ?? []) as RootContent[],
        questionSource: mdastToString({ type: 'root', children: question } as Root),
        quiz,
      })

      // Rewrite for inline rendering. remark-rehype has no handler for directives,
      // so the hast shape has to be spelled out via data.hName/hProperties.
      const cardIndex = cards.length - 1
      n.data = {
        hName: 'div',
        hProperties: { className: ['kcard'], 'data-card': String(cardIndex) },
      }
      answerNode.data = { hName: 'details', hProperties: { className: ['kcard-a'] } }
      answerNode.children = [
        {
          type: 'paragraph',
          data: { hName: 'summary' },
          children: [{ type: 'text', value: '显示答案' }],
        } as unknown as BlockContent | DefinitionContent,
        ...((answerNode.children ?? []) as (BlockContent | DefinitionContent)[]),
      ] as RootContent[]

      n.children = [
        {
          type: 'containerDirective',
          name: 'question',
          data: { hName: 'div', hProperties: { className: ['kcard-q'] } },
          children: question,
        } as unknown as RootContent,
        answerNode as unknown as RootContent,
      ]
    })

    file.data.cards = cards
    file.data.cardErrors = errors
  }
}

/**
 * :::quiz — authored multiple-choice options, exactly 4 (one ✓-marked
 * correct + 3 distractors), written by the card author (or generated by an
 * AI assistant and pasted in). Options harvested from OTHER cards' answers
 * were tried first and failed: distractors from unrelated notes are
 * eliminable on style alone, which turns the quiz into a giveaway.
 *
 *   :::quiz
 *   - ✓ 正确的简短表述
 *   - 貌似合理的错误 1
 *   - 貌似合理的错误 2
 *   - 貌似合理的错误 3
 *   :::
 *
 * Returns an error string (build-fatal upstream) rather than guessing — a
 * malformed quiz silently skipped would look like "quiz mode ignores my card".
 */
function parseQuiz(node: Container): NonNullable<RawCard['quiz']> | string {
  const kids = (node.children ?? []) as RootContent[]
  const list = kids.length === 1 && kids[0].type === 'list' ? (kids[0] as unknown as Container) : undefined
  if (!list) return '里应当只有一个列表（四个 - 开头的选项）'

  const items = (list.children ?? []) as Container[]
  if (items.length !== 4) return `需要恰好 4 个选项（1 个 ✓ 正确 + 3 个干扰），现在是 ${items.length} 个`

  let correct: RootContent[] | null = null
  const distractors: RootContent[][] = []
  for (const item of items) {
    const content = (item.children ?? []) as RootContent[]
    if (stripCheckMark(content)) {
      if (correct) return '有多个 ✓ 正确项，只能有一个'
      correct = content
    } else {
      distractors.push(content)
    }
  }
  if (!correct) return '没有 ✓ 标记的正确项（在正确选项开头加「✓ 」）'
  return { correct, distractors }
}

/** Detects a leading ✓ on the item's first text node and removes it. */
function stripCheckMark(content: RootContent[]): boolean {
  const para = content[0] as Container | undefined
  const first = (para?.children?.[0] ?? undefined) as { type?: string; value?: string } | undefined
  if (para?.type !== 'paragraph' || first?.type !== 'text' || !first.value?.match(/^[✓√]\s*/)) return false
  first.value = first.value.replace(/^[✓√]\s*/, '')
  return true
}
