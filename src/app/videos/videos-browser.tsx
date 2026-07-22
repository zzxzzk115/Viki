'use client'

import { useEffect, useMemo, useState } from 'react'
import { AddVideo } from '@/components/add-video'
import { withBase } from '@/lib/base-path'
import type { VideoItem } from '@/lib/video-feed'

/**
 * Discovery section on /videos: recent uploads from subscribed channels
 * (data/videos.json), filterable by category, each with a one-click 收藏 that
 * turns it into a video note.
 */
export function VideosBrowser() {
  const [items, setItems] = useState<VideoItem[] | null>(null)
  const [cat, setCat] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(withBase('/data/videos.json'))
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((f: { items?: VideoItem[] }) => alive && setItems(f.items ?? []))
      .catch(() => alive && setItems([]))
    return () => {
      alive = false
    }
  }, [])

  const cats = useMemo(() => [...new Set((items ?? []).map((i) => i.category))], [items])
  const shown = useMemo(() => (cat ? (items ?? []).filter((i) => i.category === cat) : items ?? []), [items, cat])

  if (!items || items.length === 0) return null

  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">推荐视频（订阅发现）</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip active={!cat} onClick={() => setCat(null)}>
          全部 {items.length}
        </Chip>
        {cats.map((c) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(cat === c ? null : c)}>
            {c}
          </Chip>
        ))}
      </div>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {shown.map((v) => (
          <li key={v.id} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <a href={v.url} target="_blank" rel="noopener noreferrer" className="group block">
              {v.thumb && <img src={v.thumb} alt="" loading="lazy" className="aspect-video w-full rounded-lg object-cover" />}
              <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug group-hover:underline">{v.title}</p>
            </a>
            <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {v.category}
              </span>
              <span className="truncate">{v.channel}</span>
            </div>
            <div className="mt-2">
              <AddVideo preset={{ platform: v.platform, id: v.videoId, title: v.title, channel: v.channel, category: v.category }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs transition ${
        active
          ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
      }`}
    >
      {children}
    </button>
  )
}
