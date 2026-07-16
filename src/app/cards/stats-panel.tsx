'use client'

import { useEffect, useMemo, useState } from 'react'
import { withBase } from '@/lib/base-path'
import { useQuizStats } from '@/lib/quiz-store'
import type { Card } from '@/lib/schema'
import { stats, toDateKey } from '@/lib/srs'
import { useHydrated, useSrsStore } from '@/lib/store'

const DAYS = 14

/**
 * The memory schedule made visible: SM-2 has always been running underneath,
 * but with no due-date histogram or accuracy numbers it read as "no memory
 * mechanism". Hand-rolled SVG bars — 14 numbers do not need a chart library.
 */
export function StatsPanel({ subject }: { subject?: string }) {
  const hydrated = useHydrated()
  const { store } = useSrsStore()
  const { quizStats } = useQuizStats()
  const [cards, setCards] = useState<Card[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch(withBase('/data/cards.json'))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((c: Card[]) => alive && setCards(c))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const pool = useMemo(
    () => (cards ?? []).filter((c) => !subject || c.subject === subject),
    [cards, subject],
  )

  const histogram = useMemo(() => {
    if (!hydrated) return []
    const today = new Date()
    const todayKey = toDateKey(today)
    const days = Array.from({ length: DAYS }, (_, i) => toDateKey(new Date(today.getTime() + i * 86400000)))
    const counts = days.map(() => 0)
    const ids = new Set(pool.map((c) => c.id))
    for (const [id, s] of Object.entries(store.cards)) {
      if (!ids.has(id)) continue
      // Overdue collapses into "today" — that is when it wants reviewing.
      const idx = s.due <= todayKey ? 0 : days.indexOf(s.due)
      if (idx >= 0) counts[idx]++
    }
    return counts
  }, [hydrated, pool, store])

  if (!hydrated || !cards) {
    return <div className="min-h-40 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900" />
  }

  const s = stats(pool, store)
  const eases = pool.map((c) => store.cards[c.id]?.ease).filter((e): e is number => e !== undefined)
  const avgEase = eases.length ? (eases.reduce((a, b) => a + b, 0) / eases.length).toFixed(2) : '—'
  const acc = quizStats.total ? Math.round((quizStats.correct / quizStats.total) * 100) : null
  const max = Math.max(1, ...histogram)

  return (
    <div className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">记忆统计</p>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <Stat label="总卡片" value={s.total} />
        <Stat label="已复习" value={s.reviewed} />
        <Stat label="今日到期" value={s.due} accent={s.due > 0} />
        <Stat label="新卡" value={s.fresh} />
        <Stat label="平均难度系数" value={avgEase} />
        <Stat label="刷题正确率" value={acc === null ? '—' : `${acc}%`} />
        <Stat label="连续刷题" value={`${quizStats.streak.current} 天`} />
        <Stat label="最长连续" value={`${quizStats.streak.best} 天`} />
        <Stat label="累计答题" value={quizStats.total} />
      </div>

      <p className="mt-5 text-xs text-neutral-400">未来 {DAYS} 天到期分布（SM-2 间隔的样子）</p>
      <svg width="100%" height="72" viewBox={`0 0 ${DAYS * 22} 72`} className="mt-1" role="img" aria-label="到期分布">
        {histogram.map((n, i) => {
          const h = n === 0 ? 2 : 6 + (n / max) * 44
          return (
            <g key={i}>
              <rect
                x={i * 22 + 2}
                y={56 - h}
                width={18}
                height={h}
                rx={2}
                className={i === 0 && n > 0 ? 'fill-amber-400' : 'fill-neutral-300 dark:fill-neutral-700'}
              />
              {n > 0 && (
                <text x={i * 22 + 11} y={52 - h} textAnchor="middle" fontSize={9} className="fill-neutral-500">
                  {n}
                </text>
              )}
              <text x={i * 22 + 11} y={68} textAnchor="middle" fontSize={8} className="fill-neutral-400">
                {i === 0 ? '今' : i === 1 ? '明' : `+${i}`}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Stat({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div>
      <span className="text-xs text-neutral-400">{label}</span>
      <p className={`font-medium tabular-nums ${accent ? 'text-amber-600 dark:text-amber-400' : ''}`}>{value}</p>
    </div>
  )
}
