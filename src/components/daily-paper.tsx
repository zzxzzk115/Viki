'use client'

import { useEffect, useMemo, useState } from 'react'
import { withBase } from '@/lib/base-path'
import { pickDaily, todaySeed } from '@/lib/daily-pick'
import type { FeedPaper } from '@/lib/papers-feed'

/**
 * 「今日论文」— one paper from the arXiv feed, picked by a date seed.
 *
 * Client-side after mount, for two reasons: the prerendered HTML is built once
 * (a build-time pick freezes the first day without a deploy), and picking during
 * render off `new Date()` would mismatch hydration. Same skeleton-first pattern
 * as ReviewCard. Date-seeded means every visitor sees the same paper on the same
 * day and a reload does not reshuffle.
 */
export function DailyPaper() {
  const [papers, setPapers] = useState<FeedPaper[] | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    fetch(withBase('/data/feed.json'))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((f: { papers?: FeedPaper[] }) => {
        if (!alive) return
        setPapers(f.papers ?? [])
        setState('ready')
      })
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
    }
  }, [])

  const pick = useMemo(() => (papers ? pickDaily(papers, todaySeed()) : null), [papers])

  if (state === 'loading') {
    return <div className="min-h-32 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900" />
  }
  // No feed yet (or fetch failed): say nothing rather than show an error box on
  // the homepage — the /arxiv page is the place that explains feed state.
  if (!pick) return null

  return (
    <a
      href={pick.url}
      className="block rounded-xl border border-neutral-200 p-5 transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold tracking-wide text-neutral-500 uppercase">今日论文</span>
        {pick.kind === 'classic' ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            经典 · 被引 {pick.citedBy}
          </span>
        ) : (
          pick.isNew && (
            <span className="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              新
            </span>
          )
        )}
        <span className="ml-auto tabular-nums text-neutral-400">{pick.published}</span>
      </div>
      <p className="mt-2 font-medium leading-snug">{pick.title}</p>
      <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{pick.abstract}</p>
      {pick.matched.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-1.5">
          {pick.matched.slice(0, 5).map((m) => (
            <span key={m} className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800">
              {m}
            </span>
          ))}
        </p>
      )}
    </a>
  )
}
