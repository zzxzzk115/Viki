import type { Card, Glossary } from './schema'
import type { Grade } from './srs'

/**
 * Quiz-question builders. Pure — option shuffling, blank picking and answer
 * checking are unit-tested, because a quiz that leaks its own answer or
 * rejects a right one teaches wrong.
 *
 * Choice options are AUTHORED (the card's :::quiz block), never harvested
 * from other cards: pool-harvested distractors were tried and failed twice —
 * options from unrelated notes are eliminable on style alone, and full-answer
 * snippets truncate into unreadable options. Written distractors are short,
 * parallel, and wrong in instructive ways.
 */

export interface ChoiceQuestion {
  mode: 'choice'
  card: Card
  /** Rendered-HTML options, shuffled. Short by construction — display in full. */
  options: string[]
  correctIndex: number
}

export interface ClozeQuestion {
  mode: 'cloze'
  card: Card
  /** answerHtml with one blankable region replaced by the blank marker. */
  blankedHtml: string
  /** Display text of what was blanked, for the reveal line. */
  term: string
  /** Normalized accepted answers (中文/en/abbr/aka for terms; the text itself for keywords). */
  accepted: string[]
  /**
   * Candidate words to fill the blank — the blanked text plus 3 keyword
   * distractors. Selection instead of typing: typing exact Chinese phrases
   * (worse on mobile) tested transcription, not memory.
   */
  options: string[]
  correctIndex: number
}

export type QuizQuestion = ChoiceQuestion | ClozeQuestion

/** 打通但降档: recognizing (choice) caps at 模糊, recalling (cloze) earns 记得. */
export function gradeFor(mode: 'choice' | 'cloze', correct: boolean): Grade {
  if (!correct) return 0
  return mode === 'choice' ? 3 : 5
}

/** Shuffles the authored options; null when the card has no :::quiz block. */
export function buildChoiceQuestion(card: Card, random: () => number = Math.random): ChoiceQuestion | null {
  if (!card.quiz) return null
  const options = shuffle([card.quiz.correct, ...card.quiz.distractors], random)
  return { mode: 'choice', card, options, correctIndex: options.indexOf(card.quiz.correct) }
}

export function stripHtml(html: string): string {
  return (
    html
      // KaTeX renders math twice (screen-reader MathML + visual layer);
      // keeping both turns "$E$" into "E E E" in extracted text.
      .replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** One candidate region of the answer that can be blanked out. */
export interface Blankable {
  kind: 'term' | 'keyword'
  /** For terms the glossary key (中文); for keywords the visible text. */
  text: string
  start: number
  end: number
  accepted: string[]
}

/**
 * Blankable regions: glossary-term spans (the pipeline's semantic markup —
 * zero authoring cost) plus **bold** phrases — bold in an answer is the
 * author already marking "this is the key point", which is exactly what a
 * keyword cloze should ask for.
 *
 * A region whose visible text appears more than once in the answer is
 * excluded: blanking one occurrence while the other stays visible hands the
 * answer over. Same reason keywords longer than ~24 chars are skipped —
 * that's a sentence, not a keyword, and nobody types it verbatim.
 */
export function findBlankables(html: string, glossary: Glossary): Blankable[] {
  const out: Blankable[] = []
  const plain = stripHtml(html)
  const occursOnce = (text: string) => plain.split(text).length === 2

  for (const m of html.matchAll(/data-term="([^"]+)"/g)) {
    const term = m[1]
    const start = html.lastIndexOf('<span', m.index)
    if (start === -1) continue
    const end = scanElement(html, start, 'span')
    if (end === null || !occursOnce(term)) continue
    const g = glossary[term]
    const accepted = [term, g?.en, g?.abbr, ...(g?.aka ?? [])]
      .filter((s): s is string => !!s)
      .map(normalizeAnswer)
    out.push({ kind: 'term', text: term, start, end, accepted: [...new Set(accepted)] })
  }

  for (const m of html.matchAll(/<strong[\s>]/g)) {
    const start = m.index
    const end = scanElement(html, start, 'strong')
    if (end === null) continue
    const inner = html.slice(html.indexOf('>', start) + 1, end - '</strong>'.length)
    if (inner.includes('class="term')) continue // the term path covers it, with better accepted answers
    const text = stripHtml(inner)
    if (text.length < 2 || text.length > 24 || !occursOnce(text)) continue
    out.push({ kind: 'keyword', text, start, end, accepted: [normalizeAnswer(text)] })
  }

  return out
}

export function checkCloze(input: string, accepted: string[]): boolean {
  return accepted.includes(normalizeAnswer(input))
}

export function normalizeAnswer(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

export const BLANK_MARKER =
  '<span class="cloze-blank" aria-label="填空">____</span>'

/**
 * Blank one randomly-chosen region; null when the card has nothing blankable
 * or too few plausible fill words exist.
 *
 * Distractor words come nearest-first — the card's other blankables, then
 * same-note cards, then same-subject, then the whole glossary — and anything
 * accepted-equal to the answer (e.g. an alias of the blanked term) is
 * excluded, so exactly one option is right.
 */
export function buildClozeQuestion(
  card: Card,
  glossary: Glossary,
  random: () => number = Math.random,
  pool: Card[] = [],
): ClozeQuestion | null {
  const blankables = findBlankables(card.answerHtml, glossary)
  if (blankables.length === 0) return null
  const b = blankables[Math.floor(random() * blankables.length)]

  const tiers: string[][] = [
    blankables.filter((x) => x !== b).map((x) => x.text),
    cardTexts(pool.filter((c) => c.id !== card.id && c.noteSlug === card.noteSlug), glossary),
    cardTexts(pool.filter((c) => c.noteSlug !== card.noteSlug && c.subject === card.subject), glossary),
    Object.keys(glossary),
  ]
  const distractors: string[] = []
  for (const tier of tiers) {
    for (const text of shuffle(tier, random)) {
      if (distractors.length === 3) break
      if (text === b.text || distractors.includes(text)) continue
      if (b.accepted.includes(normalizeAnswer(text))) continue // a second right answer
      distractors.push(text)
    }
    if (distractors.length === 3) break
  }
  if (distractors.length < 3) return null

  const options = shuffle([b.text, ...distractors], random)
  return {
    mode: 'cloze',
    card,
    blankedHtml: card.answerHtml.slice(0, b.start) + BLANK_MARKER + card.answerHtml.slice(b.end),
    term: b.text,
    accepted: b.accepted,
    options,
    correctIndex: options.indexOf(b.text),
  }
}

function cardTexts(cards: Card[], glossary: Glossary): string[] {
  return cards.flatMap((c) => findBlankables(c.answerHtml, glossary).map((x) => x.text))
}

/**
 * A quiz session: due cards first, then new, then already-reviewed as filler —
 * same priority as pickNext, but batched. A card with both authored options
 * and blankable keywords alternates by coin flip (recall practice is worth
 * more, but variety keeps sessions from feeling scripted); a card with
 * neither is simply not quizzable — it still appears in 翻卡 mode.
 */
export function buildSession(
  cards: Card[],
  dueIds: Set<string>,
  newIds: Set<string>,
  glossary: Glossary,
  n: number,
  random: () => number = Math.random,
): QuizQuestion[] {
  const ranked = [
    ...shuffle(cards.filter((c) => dueIds.has(c.id)), random),
    ...shuffle(cards.filter((c) => newIds.has(c.id)), random),
    ...shuffle(cards.filter((c) => !dueIds.has(c.id) && !newIds.has(c.id)), random),
  ]

  const questions: QuizQuestion[] = []
  for (const card of ranked) {
    if (questions.length >= n) break
    const preferCloze = random() < 0.5
    const q = preferCloze
      ? (buildClozeQuestion(card, glossary, random, cards) ?? buildChoiceQuestion(card, random))
      : (buildChoiceQuestion(card, random) ?? buildClozeQuestion(card, glossary, random, cards))
    if (q) questions.push(q)
  }
  return questions
}

/**
 * Walks past nested same-tag elements to the matching close tag (a term-en
 * span nests inside the term span — a regex cannot pair the close tag
 * reliably; this codebase measured that twice). Returns the index just past
 * the close tag, or null on malformed markup.
 */
function scanElement(html: string, openStart: number, tag: 'span' | 'strong'): number | null {
  const openToken = `<${tag}`
  const closeToken = `</${tag}>`
  let depth = 0
  let i = openStart
  while (i < html.length) {
    const open = html.indexOf(openToken, i)
    const close = html.indexOf(closeToken, i)
    if (close === -1) return null
    if (open !== -1 && open < close) {
      depth++
      i = open + openToken.length
    } else {
      depth--
      i = close + closeToken.length
      if (depth === 0) return i
    }
  }
  return null
}

function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
