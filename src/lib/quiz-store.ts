'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { toDateKey } from './srs'

/**
 * Quiz accuracy + streak, under its OWN localStorage key. Deliberately not
 * inside viki:srs:v1: store.ts:parse() hard-rejects any shape whose v !== 1,
 * so touching that store risks wiping review history for zero benefit — the
 * two datasets answer different questions anyway (何时复习 vs 答得准不准).
 */

const KEY = 'viki:quiz:v1'

export interface QuizStats {
  v: 1
  total: number
  correct: number
  bySubject: Record<string, { total: number; correct: number }>
  streak: { current: number; best: number; lastDay: string }
}

export const emptyQuizStats = (): QuizStats => ({
  v: 1,
  total: 0,
  correct: 0,
  bySubject: {},
  streak: { current: 0, best: 0, lastDay: '' },
})

/** One answered question folded in. Streak counts consecutive practice DAYS. */
export function recordAnswer(prev: QuizStats, subject: string, correct: boolean, today = new Date()): QuizStats {
  const day = toDateKey(today)
  const yesterday = toDateKey(new Date(today.getTime() - 86400000))

  let { current, best, lastDay } = prev.streak
  if (lastDay !== day) {
    current = lastDay === yesterday ? current + 1 : 1
    lastDay = day
    best = Math.max(best, current)
  }

  const s = prev.bySubject[subject] ?? { total: 0, correct: 0 }
  return {
    v: 1,
    total: prev.total + 1,
    correct: prev.correct + (correct ? 1 : 0),
    bySubject: {
      ...prev.bySubject,
      [subject]: { total: s.total + 1, correct: s.correct + (correct ? 1 : 0) },
    },
    streak: { current, best, lastDay },
  }
}

// ---- localStorage bridge, same shape as store.ts ----

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  window.addEventListener('storage', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}

const EMPTY = '{}'
const getSnapshot = () => {
  try {
    return localStorage.getItem(KEY) ?? EMPTY
  } catch {
    return EMPTY
  }
}
const getServerSnapshot = () => EMPTY

function parse(raw: string): QuizStats {
  try {
    const d = JSON.parse(raw) as Partial<QuizStats>
    if (d?.v !== 1 || typeof d.bySubject !== 'object' || !d.streak) return emptyQuizStats()
    return d as QuizStats
  } catch {
    return emptyQuizStats()
  }
}

export function useQuizStats() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const quizStats = useMemo(() => parse(raw), [raw])

  const saveQuizStats = useCallback((next: QuizStats) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {}
    emit()
    // Same synthetic event as store.ts: the sync agent listens for this key;
    // same-tab setItem never fires the real storage event.
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
  }, [])

  return { quizStats, saveQuizStats }
}
