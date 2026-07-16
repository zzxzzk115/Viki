'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { withBase } from '@/lib/base-path'
import type { Card } from '@/lib/schema'
import { GRADES, pickNext, schedule, stats, sweep, type Grade } from '@/lib/srs'
import { useHydrated, useSrsStore } from '@/lib/store'
import { LevelBadge } from './level-badge'

/**
 * Cards are fetched at runtime, never imported: Next inlines imported JSON into
 * the bundle and tree-shaking will not save it, so `import cards from
 * '.../cards.json'` would grow every page as the knowledge base grows.
 * fetch() keeps it browser-cached and out of the bundle, flat forever.
 */
function useCards() {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(withBase('/data/cards.json'))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((c: Card[]) => alive && setCards(c))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [])

  return { cards, error }
}

export function ReviewCard({ subject, compact = false }: { subject?: string; compact?: boolean }) {
  const hydrated = useHydrated()
  const { cards: all, error } = useCards()
  const { store, save } = useSrsStore()
  const [revealed, setRevealed] = useState(false)
  const [extra, setExtra] = useState(0)

  const cards = useMemo(
    () => (all ?? []).filter((c) => !subject || c.subject === subject),
    [all, subject],
  )

  const pick = useMemo(
    () => pickNext(cards, store, new Date()),
    // `extra` re-rolls the random pick when the user asks for another card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, store, extra],
  )

  const s = useMemo(() => stats(cards, store), [cards, store])

  const grade = useCallback(
    (g: Grade) => {
      if (!pick.card) return
      const swept = sweep(store, new Set(cards.map((c) => c.id)))
      save({
        ...swept,
        cards: { ...swept.cards, [pick.card.id]: schedule(store.cards[pick.card.id], g, new Date()) },
      })
      setRevealed(false)
    },
    [pick.card, store, save, cards],
  )

  // Fixed-height skeleton until the client snapshot is live — no layout shift,
  // and no chance of a server/client mismatch since nothing is decided yet.
  if (!hydrated || !all) {
    return (
      <div className={`${compact ? 'min-h-44' : 'min-h-64'} animate-pulse rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900`} />
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-neutral-200 p-6 text-sm text-neutral-500 dark:border-neutral-800">
        卡片加载失败。
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
        还没有卡片。在笔记里写 <code className="text-xs">::::card</code> 就会出现在这里。
      </div>
    )
  }

  if (!pick.card) {
    return (
      <div className="rounded-xl border border-neutral-200 p-8 text-center dark:border-neutral-800">
        <p className="text-lg">今天复习完了 🎉</p>
        <p className="mt-1 text-sm text-neutral-500">
          共 {s.total} 张 · 已复习 {s.reviewed} 张
        </p>
        <button
          type="button"
          onClick={() => setExtra((n) => n + 1)}
          className="mt-4 text-sm text-neutral-500 underline hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          随机再来一张
        </button>
      </div>
    )
  }

  const c = pick.card

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-2.5 text-xs text-neutral-500 dark:border-neutral-800">
        <span
          className={
            pick.queue === 'due'
              ? 'font-medium text-amber-600 dark:text-amber-400'
              : 'font-medium text-sky-600 dark:text-sky-400'
          }
        >
          {pick.queue === 'due' ? `待复习 ${pick.dueCount}` : '新卡片'}
        </span>
        <LevelBadge level={c.level} />
        <span className="ml-auto">
          {s.reviewed}/{s.total} 已复习
        </span>
      </div>

      <div className="p-6">
        <p className="mb-3 text-xs tracking-wide text-neutral-400 uppercase">还记得吗？</p>
        {/* Built at build time from our own repo, through the same processor as
            the note body — so KaTeX and shiki work inside cards. */}
        <div
          className="prose prose-neutral dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: c.questionHtml }}
        />

        {revealed ? (
          <>
            <hr className="my-5 border-neutral-200 dark:border-neutral-800" />
            <div
              className="prose prose-neutral dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: c.answerHtml }}
            />
            <div className="mt-6 grid grid-cols-3 gap-2">
              {GRADES.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => grade(g.value)}
                  title={g.hint}
                  className="rounded-lg border border-neutral-200 py-2.5 text-sm font-medium transition hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
                >
                  {g.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="mt-6 w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            显示答案
          </button>
        )}
      </div>

      <div className="border-t border-neutral-200 px-5 py-2.5 text-xs dark:border-neutral-800">
        <Link
          href={`/notes/${c.noteSlug}/${c.anchor ? `#${c.anchor}` : ''}`}
          className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          出自：{c.noteTitle} →
        </Link>
      </div>
    </div>
  )
}
