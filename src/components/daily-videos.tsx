'use client'

import { useEffect, useMemo, useState } from 'react'
import { AddVideo } from '@/components/add-video'
import { withBase } from '@/lib/base-path'
import { pickDaily, todaySeed } from '@/lib/daily-pick'
import type { VideoItem } from '@/lib/video-feed'

/**
 * 「今日推荐视频」— one per category from the subscription feed, date-seeded.
 * Same client-after-mount pattern as DailyReading. Thumbnails link out; 收藏
 * lives on the /videos page (keeps the homepage card light).
 */
export function DailyVideos() {
  const [items, setItems] = useState<VideoItem[] | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    fetch(withBase('/data/videos.json'))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((f: { items?: VideoItem[] }) => {
        if (!alive) return
        setItems(f.items ?? [])
        setState('ready')
      })
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
    }
  }, [])

  const picks = useMemo(() => {
    if (!items) return []
    const seed = todaySeed()
    const byCat = new Map<string, VideoItem[]>()
    for (const i of items) byCat.set(i.category, [...(byCat.get(i.category) ?? []), i])
    return [...byCat.entries()]
      .map(([cat, list]) => pickDaily(list, `${seed}:vid:${cat}`))
      .filter((x): x is VideoItem => x !== null)
      .slice(0, 4)
  }, [items])

  if (state === 'loading') {
    return <div className="min-h-32 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900" />
  }
  if (picks.length === 0) return null

  return (
    <div className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold tracking-wide text-neutral-500 uppercase">今日推荐视频</span>
        <a href={withBase('/videos/')} className="ml-auto text-neutral-400 hover:underline">
          更多 →
        </a>
      </div>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {picks.map((v) => (
          <li key={v.id}>
            <a href={v.url} target="_blank" rel="noopener noreferrer" className="group block">
              {v.thumb && (
                <img
                  src={v.thumb.replace(/^http:/, 'https:')}
                  alt=""
                  loading="lazy"
                  // hdslb.com (Bilibili) 403s a foreign Referer; no-referrer loads fine.
                  referrerPolicy="no-referrer"
                  className="aspect-video w-full rounded-lg bg-neutral-100 object-cover dark:bg-neutral-800"
                />
              )}
              <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {v.category}
                </span>
                <span className="truncate">{v.channel}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug group-hover:underline">{v.title}</p>
            </a>
            <div className="mt-1">
              <AddVideo preset={{ platform: v.platform, id: v.videoId, title: v.title, channel: v.channel, category: v.category }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
