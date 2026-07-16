'use client'

import { useMemo, useState } from 'react'
import type { FeedPaper } from '@/lib/papers-feed'
import { FeedList } from './feed-list'

/**
 * /arxiv list with topic chips — same filter pattern as the papers table and
 * the citation graph, so the feed reads by topic instead of one flat ranking.
 */
export function FeedBrowser({ papers }: { papers: FeedPaper[] }) {
  const [topic, setTopic] = useState<string | null>(null)

  const topics = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of papers) if (p.topic) counts.set(p.topic, (counts.get(p.topic) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [papers])

  const shown = topic ? papers.filter((p) => p.topic === topic) : papers

  return (
    <>
      {topics.length > 1 && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Chip active={topic === null} onClick={() => setTopic(null)}>
            全部 {papers.length}
          </Chip>
          {topics.map(([t, n]) => (
            <Chip key={t} active={topic === t} onClick={() => setTopic(topic === t ? null : t)}>
              {t} {n}
            </Chip>
          ))}
        </div>
      )}
      <FeedList papers={shown} />
    </>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
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
