/**
 * Dictation cloze: blank a few content words of a sentence so the learner
 * types what they hear. Pure — blank picking and answer checking are unit
 * tested, because a dictation that rejects a right answer or blanks a word
 * you can't hear teaches wrong.
 */

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'is', 'am',
  'are', 'was', 'were', 'be', 'been', 'do', 'does', 'did', 'i', 'you', 'he', 'she', 'it', 'we',
  'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this', 'that', 'these', 'those',
  'as', 'so', 'if', 'not', 'no', 'yes', 'me', 'him', 'us', 'them',
])

export interface DictToken {
  /** The word as written (with any punctuation). */
  raw: string
  /** True when the learner must type this word. */
  blank: boolean
}

export interface Dictation {
  tokens: DictToken[]
  /** Normalized accepted answers for each blank, in order. */
  answers: string[]
}

/** Lowercase, strip surrounding punctuation — for comparison and blank tests. */
export function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '')
}

/**
 * Blank up to `maxBlanks` content words (≥3 letters, not a stopword), spread
 * across the sentence. Deterministic given `random` so tests are stable.
 */
export function buildDictation(sentence: string, random: () => number = Math.random, maxBlanks = 3): Dictation {
  const words = sentence.split(/\s+/).filter(Boolean)
  const candidates: number[] = []
  words.forEach((w, i) => {
    const n = normalizeWord(w)
    if (n.length >= 3 && !STOP.has(n)) candidates.push(i)
  })

  const n = Math.min(maxBlanks, Math.max(1, Math.round(candidates.length * 0.5)))
  // Shuffle candidate indices, take n, then restore sentence order.
  const shuffled = [...candidates]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const blanked = new Set(shuffled.slice(0, Math.min(n, shuffled.length)))

  const tokens: DictToken[] = words.map((raw, i) => ({ raw, blank: blanked.has(i) }))
  const answers = words.filter((_, i) => blanked.has(i)).map(normalizeWord)
  return { tokens, answers }
}

export function checkWord(input: string, answer: string): boolean {
  return normalizeWord(input) === answer
}

/** Per-blank correctness for a submitted set of inputs. */
export function checkDictation(inputs: string[], answers: string[]): boolean[] {
  return answers.map((a, i) => checkWord(inputs[i] ?? '', a))
}
