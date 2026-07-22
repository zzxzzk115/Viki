'use client'

import { useMemo, useState } from 'react'
import type { ReadingItem } from '@/lib/reading-feed'
import { askAiAbout } from '@/components/ai-chat'
import { useAiConfig } from '@/components/ai-settings'

const CATEGORIES: { key: ReadingItem['category']; label: string }[] = [
  { key: 'news', label: '世界新闻' },
  { key: 'finance', label: '金融' },
  { key: 'tech', label: '技术研究' },
  { key: 'english', label: '英语学习' },
  { key: 'culture', label: '通识文化' },
]

export function ReadingBrowser({ items }: { items: ReadingItem[] }) {
  const [cat, setCat] = useState<ReadingItem['category'] | null>(null)
  const aiConfig = useAiConfig()
  const shown = useMemo(() => (cat ? items.filter((i) => i.category === cat) : items), [items, cat])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const i of items) c[i.category] = (c[i.category] ?? 0) + 1
    return c
  }, [items])

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2">
        <Chip active={!cat} onClick={() => setCat(null)}>
          全部 {items.length}
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c.key} active={cat === c.key} onClick={() => setCat(cat === c.key ? null : c.key)}>
            {c.label} {counts[c.key] ?? 0}
          </Chip>
        ))}
      </div>

      <ul className="mt-5 space-y-4">
        {shown.map((it) => (
          <li key={it.id} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {it.source}
              </span>
              {it.tags.slice(0, 3).map((t) => (
                <span key={t}>#{t}</span>
              ))}
              {it.published && <span className="ml-auto tabular-nums">{it.published}</span>}
            </div>
            <a href={it.url} className="mt-2 block font-medium leading-snug hover:underline" target="_blank" rel="noreferrer">
              {it.title}
            </a>
            {it.summary && <p className="mt-1 line-clamp-3 text-sm text-neutral-500">{it.summary}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <a href={it.url} className="text-neutral-500 hover:underline" target="_blank" rel="noreferrer">
                读原文 →
              </a>
              {aiConfig && (
                <button
                  type="button"
                  onClick={() => askAiAbout(it)}
                  className="text-sky-600 hover:underline dark:text-sky-400"
                >
                  问 AI / 记笔记
                </button>
              )}
              {it.author && <span className="text-neutral-400">{it.author}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
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
