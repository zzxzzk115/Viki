import type { Card, Glossary } from './schema'
import type { Grade } from './srs'

/**
 * Quiz-question builders. Pure — the correctness of distractor picking,
 * cloze blanking and answer checking is unit-tested, because a quiz that
 * sometimes shows two right options or rejects a right answer teaches wrong.
 */

export interface ChoiceQuestion {
  mode: 'choice'
  card: Card
  /** Plain-text answer snippets, shuffled. */
  options: string[]
  correctIndex: number
}

export interface ClozeQuestion {
  mode: 'cloze'
  card: Card
  /** answerHtml with one term span replaced by a blank marker. */
  blankedHtml: string
  /** The blanked term (Chinese key). */
  term: string
  /** Normalized accepted answers: Chinese term, English, abbreviation, akas. */
  accepted: string[]
}

export type QuizQuestion = ChoiceQuestion | ClozeQuestion

/** 打通但降档: recognition (choice) caps at 模糊, recall (cloze) earns 记得. */
export function gradeFor(mode: 'choice' | 'cloze', correct: boolean): Grade {
  if (!correct) return 0
  return mode === 'choice' ? 3 : 5
}

export function stripHtml(html: string): string {
  return (
    html
      // KaTeX renders math twice (screen-reader MathML + visual layer);
      // keeping both turns "$E$" into "E E E" in option text.
      .replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** Answer as an option label: plain text, capped so four fit on screen. */
export function answerSnippet(card: Card, max = 120): string {
  const t = stripHtml(card.answerHtml)
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/**
 * Character-bigram overlap coefficient — cheap topical similarity that works
 * for Chinese (no word boundaries to tokenize on). Overlap (÷ smaller set)
 * rather than Dice (÷ sum) because option snippets are much shorter than the
 * question+answer text they are compared against.
 */
export function textSimilarity(a: string, b: string): number {
  const A = bigrams(a)
  const B = bigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return inter / Math.min(A.size, B.size)
}

function bigrams(s: string): Set<string> {
  const t = s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  const out = new Set<string>()
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2))
  return out
}

/** Minimum similarity for a cross-note distractor to count as on-topic. */
const RELATED_SIM = 0.18

/**
 * Multiple choice: the card's answer vs 3 distractor answers, most-topical
 * first. Same-note cards are on-topic by construction; everything else ranks
 * by lexical similarity to this card's question+answer. Subject alone proved
 * too coarse — 面试/cpp and 面试/graphics share a subject and nothing else,
 * and a 虚函数 option under a 渲染管线 question is a giveaway.
 *
 * Returns null when fewer than 3 distinct distractors exist (a 2-option
 * "quiz" is a coin flip) or fewer than 2 of them are on-topic (the stray
 * options visibly answer different questions, so the right one is free).
 */
export function buildChoiceQuestion(
  card: Card,
  pool: Card[],
  random: () => number = Math.random,
): ChoiceQuestion | null {
  const correct = answerSnippet(card)
  const target = `${stripHtml(card.questionHtml)} ${stripHtml(card.answerHtml)}`

  const candidates = pool.filter((c) => c.id !== card.id)
  const sameNote = shuffle(
    candidates.filter((c) => c.noteSlug === card.noteSlug),
    random,
  )
  const rest = candidates
    .filter((c) => c.noteSlug !== card.noteSlug)
    .map((c) => ({ c, sim: textSimilarity(stripHtml(c.answerHtml), target) }))
    .sort((a, b) => b.sim - a.sim)

  const onTopic = new Set(sameNote.map((c) => c.id))
  for (const { c, sim } of rest) if (sim >= RELATED_SIM) onTopic.add(c.id)

  const ordered = [...sameNote, ...rest.map((r) => r.c)]
  const distractors: string[] = []
  let onTopicCount = 0
  for (const c of ordered) {
    const s = answerSnippet(c)
    // A distractor equal to the right answer makes two correct options.
    if (s === correct || distractors.includes(s)) continue
    distractors.push(s)
    if (onTopic.has(c.id)) onTopicCount++
    if (distractors.length === 3) break
  }
  if (distractors.length < 3 || onTopicCount < 2) return null

  const options = shuffle([correct, ...distractors], random)
  return { mode: 'choice', card, options, correctIndex: options.indexOf(correct) }
}

/**
 * Cloze: blank one glossary-term span out of the answer. The term spans are
 * semantic markup the pipeline already emits (`<span class="term"
 * data-term="中文">中文<span class="term-en"> (english)</span></span>`), so
 * cloze needs no authoring syntax at all.
 *
 * Blanking walks span nesting by depth — the term-en child means a regex
 * cannot find the matching close tag reliably (measured twice this codebase).
 */
export function buildClozeQuestion(
  card: Card,
  glossary: Glossary,
  random: () => number = Math.random,
): ClozeQuestion | null {
  const terms = extractTerms(card.answerHtml)
  if (terms.length === 0) return null
  const term = terms[Math.floor(random() * terms.length)]

  const blankedHtml = blankTermSpan(card.answerHtml, term)
  if (!blankedHtml) return null

  const g = glossary[term]
  const accepted = [term, g?.en, g?.abbr, ...(g?.aka ?? [])]
    .filter((s): s is string => !!s)
    .map(normalizeAnswer)

  return { mode: 'cloze', card, blankedHtml, term, accepted: [...new Set(accepted)] }
}

export function checkCloze(input: string, accepted: string[]): boolean {
  return accepted.includes(normalizeAnswer(input))
}

export function normalizeAnswer(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Distinct data-term keys present in the HTML. */
export function extractTerms(html: string): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(/data-term="([^"]+)"/g)) out.add(m[1])
  return [...out]
}

export const BLANK_MARKER =
  '<span class="cloze-blank" aria-label="填空">____</span>'

/**
 * Replaces the FIRST span carrying data-term="<term>" (including all nested
 * children) with the blank marker. Depth-counted scan, not a regex.
 * Returns null if the span is not found or is malformed.
 */
export function blankTermSpan(html: string, term: string): string | null {
  const attr = `data-term="${term}"`
  const attrAt = html.indexOf(attr)
  if (attrAt === -1) return null
  const start = html.lastIndexOf('<span', attrAt)
  if (start === -1) return null

  let depth = 0
  let i = start
  while (i < html.length) {
    const open = html.indexOf('<span', i)
    const close = html.indexOf('</span>', i)
    if (close === -1) return null // malformed
    if (open !== -1 && open < close) {
      depth++
      i = open + 5
    } else {
      depth--
      i = close + 7
      if (depth === 0) {
        return html.slice(0, start) + BLANK_MARKER + html.slice(i)
      }
    }
  }
  return null
}

/**
 * A quiz session: due cards first, then new, then already-reviewed as filler —
 * same priority as pickNext, but batched. Cloze when the card has terms and
 * the coin says so (recall practice is worth more), choice otherwise; falls
 * through to whichever mode is buildable.
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
    const preferCloze = extractTerms(card.answerHtml).length > 0 && random() < 0.5
    const q = preferCloze
      ? (buildClozeQuestion(card, glossary, random) ?? buildChoiceQuestion(card, cards, random))
      : (buildChoiceQuestion(card, cards, random) ?? buildClozeQuestion(card, glossary, random))
    if (q) questions.push(q)
  }
  return questions
}

function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
