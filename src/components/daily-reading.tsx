'use client'

import { useEffect, useMemo, useState } from 'react'
import { askAiAbout } from '@/components/ai-chat'
import { useAiConfig } from '@/components/ai-settings'
import { withBase } from '@/lib/base-path'
import { pickDaily, todaySeed } from '@/lib/daily-pick'
import type { ReadingItem } from '@/lib/reading-feed'

const CAT_LABEL: Record<ReadingItem['category'], string> = {
  english: '英语',
  tech: '技术',
  culture: '通识',
}

/**
 * 「今日推荐阅读」— one article from the reading feed per category, date-seeded.
 * Same client-after-mount pattern as DailyPaper (build-time pick would freeze
 * the first day; date seed keeps it stable per day, no reshuffle on reload).
 */
export function DailyReading() {
  const [items, setItems] = useState<ReadingItem[] | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const aiConfig = useAiConfig()

  useEffect(() => {
    let alive = true
    fetch(withBase('/data/reading.json'))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((f: { items?: ReadingItem[] }) => {
        if (!alive) return
        setItems(f.items ?? [])
        setState('ready')
      })
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
    }
  }, [])

  // One pick per category present, date-seeded within each.
  const picks = useMemo(() => {
    if (!items) return []
    const seed = todaySeed()
    const byCat = new Map<ReadingItem['category'], ReadingItem[]>()
    for (const i of items) byCat.set(i.category, [...(byCat.get(i.category) ?? []), i])
    return [...byCat.entries()]
      .map(([cat, list]) => pickDaily(list, `${seed}:${cat}`))
      .filter((x): x is ReadingItem => x !== null)
  }, [items])

  if (state === 'loading') {
    return <div className="min-h-32 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900" />
  }
  if (picks.length === 0) return null

  return (
    <div className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold tracking-wide text-neutral-500 uppercase">今日推荐阅读</span>
        <a href={withBase('/read/')} className="ml-auto text-neutral-400 hover:underline">
          更多 →
        </a>
      </div>
      <ul className="mt-3 space-y-3">
        {picks.map((it) => (
          <li key={it.id}>
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {CAT_LABEL[it.category]}
              </span>
              <span className="truncate">{it.source}</span>
            </div>
            <a href={it.url} target="_blank" rel="noreferrer" className="mt-1 block text-sm font-medium leading-snug hover:underline">
              {it.title}
            </a>
            {it.summary && <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{it.summary}</p>}
            {aiConfig && (
              <button type="button" onClick={() => askAiAbout(it)} className="mt-1 text-xs text-sky-600 hover:underline dark:text-sky-400">
                问 AI →
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
