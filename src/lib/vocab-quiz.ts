import type { Word } from './schema'
import type { Grade } from './srs'

/**
 * Vocabulary quiz: recall the WORD from its meaning + a blanked example.
 * Deliberately not quiz.ts — that path blanks glossary `:term` spans and
 * authored `:::quiz` options (Chinese-primary, wrong direction). Here the
 * prompt is the definition and the answer is the English headword.
 */

export const WORD_BLANK = '＿＿＿＿'

export interface SpellQuestion {
  word: Word
  /** exampleHtml with the headword replaced by a blank, or null if no example. */
  blankedExampleHtml: string | null
  /** Accepted spellings, normalized. */
  accepted: string[]
}

export function normalizeSpelling(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Blanks every whole-word occurrence of the headword in the example HTML. */
export function blankWord(exampleHtml: string, word: string): string {
  // Word boundary on letters only; case-insensitive; keeps punctuation.
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return exampleHtml.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), WORD_BLANK)
}

export function buildSpellQuestion(word: Word): SpellQuestion {
  return {
    word,
    blankedExampleHtml: word.exampleHtml ? blankWord(word.exampleHtml, word.word) : null,
    accepted: [normalizeSpelling(word.word)],
  }
}

export function checkSpelling(input: string, accepted: string[]): boolean {
  return accepted.includes(normalizeSpelling(input))
}

/** Spelling from memory is full recall → 记得; a miss → 忘记. */
export function gradeSpell(correct: boolean): Grade {
  return correct ? 5 : 0
}
