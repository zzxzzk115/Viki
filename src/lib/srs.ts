/**
 * SM-2 spaced repetition. Pure — no I/O, no clock of its own, no storage.
 * That is what makes it unit-testable, and it is the only part of the review
 * system where a subtle bug silently degrades every future interval.
 */

/** 忘记 / 模糊 / 记得. Three, not two: SM-2's ease update is driven by the
 *  grade spread, and feeding it only {0,5} makes the ease factor oscillate
 *  between its bounds until intervals stop meaning anything. */
export type Grade = 0 | 3 | 5

export const GRADES: { value: Grade; label: string; hint: string }[] = [
  { value: 0, label: '忘记', hint: '明天再来' },
  { value: 3, label: '模糊', hint: '想起来了，但费劲' },
  { value: 5, label: '记得', hint: '脱口而出' },
]

export interface CardState {
  /** Ease factor. Starts at 2.5, never below 1.3. */
  ease: number
  /** Days until the next review. */
  interval: number
  /** Consecutive successful reviews. */
  reps: number
  /** How many times this card has been forgotten. */
  lapses: number
  /** 'YYYY-MM-DD' — date-only, so a review at 23:59 is not "overdue" at 00:01. */
  due: string
  last: string
}

export const STORE_VERSION = 1

export interface Store {
  v: typeof STORE_VERSION
  /** Sparse: an unreviewed card has no entry. A new visitor's store is {},
   *  so per-visitor independence needs no seeding. */
  cards: Record<string, CardState>
}

export const emptyStore = (): Store => ({ v: STORE_VERSION, cards: {} })

const MIN_EASE = 1.3
const INITIAL_EASE = 2.5

export function toDateKey(d: Date): string {
  // Local date, not UTC: "due today" should mean the user's today.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + days)
  return out
}

/**
 * The SM-2 update. `prev` undefined means the card is new.
 * Returns the next state; never mutates.
 */
export function schedule(prev: CardState | undefined, grade: Grade, today = new Date()): CardState {
  const ease = prev?.ease ?? INITIAL_EASE
  const reps = prev?.reps ?? 0
  const lapses = prev?.lapses ?? 0

  let nextReps: number
  let interval: number
  let nextLapses = lapses

  if (grade < 3) {
    nextReps = 0
    interval = 1
    nextLapses = lapses + 1
  } else {
    nextReps = reps + 1
    interval = reps === 0 ? 1 : reps === 1 ? 6 : Math.round((prev?.interval ?? 1) * ease)
  }

  // SM-2's ease update. At grade 5 this adds +0.1; at 3 it subtracts 0.14.
  const nextEase = Math.max(MIN_EASE, ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)))

  return {
    ease: Number(nextEase.toFixed(4)),
    interval,
    reps: nextReps,
    lapses: nextLapses,
    due: toDateKey(addDays(today, interval)),
    last: toDateKey(today),
  }
}

export type Queue = 'due' | 'new' | 'done'

export interface Pick<T> {
  card: T | null
  queue: Queue
  dueCount: number
  newCount: number
}

/**
 * Picks the next card: due first (oldest first), then an unseen one, then
 * nothing. `random` is injected so callers can seed it and tests stay
 * deterministic.
 */
export function pickNext<T extends { id: string }>(
  cards: T[],
  store: Store,
  today = new Date(),
  random: () => number = Math.random,
): Pick<T> {
  const todayKey = toDateKey(today)

  const due = cards.filter((c) => {
    const s = store.cards[c.id]
    return s && s.due <= todayKey
  })
  // Orphans (card deleted from content) are ignored on read; the store is swept on write.
  const fresh = cards.filter((c) => !store.cards[c.id])

  if (due.length > 0) {
    // Oldest due date first; ties broken randomly so the same card is not
    // always the one served.
    const oldestKey = due.reduce(
      (min, c) => (store.cards[c.id].due < min ? store.cards[c.id].due : min),
      store.cards[due[0].id].due,
    )
    const tied = due.filter((c) => store.cards[c.id].due === oldestKey)
    return {
      card: tied[Math.floor(random() * tied.length)],
      queue: 'due',
      dueCount: due.length,
      newCount: fresh.length,
    }
  }

  if (fresh.length > 0) {
    return {
      card: fresh[Math.floor(random() * fresh.length)],
      queue: 'new',
      dueCount: 0,
      newCount: fresh.length,
    }
  }

  return { card: null, queue: 'done', dueCount: 0, newCount: 0 }
}

/** Drops entries whose card no longer exists. Called on write, not on read. */
export function sweep(store: Store, liveIds: Set<string>): Store {
  const cards: Record<string, CardState> = {}
  for (const [id, s] of Object.entries(store.cards)) {
    if (liveIds.has(id)) cards[id] = s
  }
  return { v: STORE_VERSION, cards }
}

export interface Stats {
  total: number
  reviewed: number
  due: number
  fresh: number
}

export function stats(cards: { id: string }[], store: Store, today = new Date()): Stats {
  const todayKey = toDateKey(today)
  let reviewed = 0
  let due = 0
  for (const c of cards) {
    const s = store.cards[c.id]
    if (!s) continue
    reviewed++
    if (s.due <= todayKey) due++
  }
  return { total: cards.length, reviewed, due, fresh: cards.length - reviewed }
}
