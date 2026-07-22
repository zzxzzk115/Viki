/**
 * Dictation progress: lifetime stats + which clips have been done, persisted in
 * localStorage (viki:listening:v1). Pure so the reducer is unit-tested; the
 * component only wraps load/save around these.
 */
import type { ListeningItem } from './listening-feed'

export interface ListeningProgress {
  /** Total clips attempted (each dictation counts once, re-dos included). */
  attempted: number
  /** Clips where every blank was right. */
  correct: number
  /** Completed runs. */
  sessions: number
  /** Last result per clip id — powers "done" marks and fresh-first ordering. */
  done: Record<string, { correct: boolean }>
}

export function emptyProgress(): ListeningProgress {
  return { attempted: 0, correct: 0, sessions: 0, done: {} }
}

/** Record one graded clip. */
export function recordResult(p: ListeningProgress, id: string, correct: boolean): ListeningProgress {
  return {
    ...p,
    attempted: p.attempted + 1,
    correct: p.correct + (correct ? 1 : 0),
    done: { ...p.done, [id]: { correct } },
  }
}

/** Mark a run finished. */
export function bumpSession(p: ListeningProgress): ListeningProgress {
  return { ...p, sessions: p.sessions + 1 }
}

/** Whole-clip accuracy as an integer percent; 0 when nothing attempted. */
export function accuracy(p: ListeningProgress): number {
  return p.attempted ? Math.round((p.correct / p.attempted) * 100) : 0
}

/**
 * Pick a run of `size` clips, surfacing never-done ones first so practice keeps
 * advancing before it repeats. Shuffles within the undone/done groups.
 */
export function pickSession(
  clips: ListeningItem[],
  p: ListeningProgress,
  size: number,
  random: () => number = Math.random,
): ListeningItem[] {
  const shuffle = (xs: ListeningItem[]) => [...xs].sort(() => random() - 0.5)
  const undone = shuffle(clips.filter((c) => !p.done[c.id]))
  const done = shuffle(clips.filter((c) => p.done[c.id]))
  return [...undone, ...done].slice(0, size)
}
