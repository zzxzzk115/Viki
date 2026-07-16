import Link from 'next/link'
import type { Hit } from '@/lib/use-search'
import type { Level } from '@/lib/schema'
import { LevelBadge } from './level-badge'

/** Shared by the nav dialog and /search so the two cannot drift apart. */
export function SearchResults({
  hits,
  onNavigate,
  compact = false,
}: {
  hits: Hit[]
  onNavigate?: () => void
  compact?: boolean
}) {
  return (
    <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
      {hits.map((h) => (
        <li key={h.id}>
          <Link
            href={h.href}
            onClick={onNavigate}
            className={`group block ${compact ? 'px-4 py-2.5' : 'py-4'} hover:bg-neutral-50 dark:hover:bg-neutral-900`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium group-hover:underline">{h.title}</span>
              {h.kind === 'paper' ? (
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800">
                  论文
                </span>
              ) : (
                <LevelBadge level={h.level as Level} />
              )}
            </div>
            {h.summary && (
              <p className={`mt-1 text-sm text-neutral-500 ${compact ? 'line-clamp-1' : ''}`}>
                {h.summary}
              </p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}
