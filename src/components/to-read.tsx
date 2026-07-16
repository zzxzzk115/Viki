'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { dailyIndex, todaySeed } from '@/lib/daily-pick'

export interface ToReadItem {
  title: string
  href: string
  venue: string
  year: number
  /** content/papers/*.md — feeds the editor link. */
  sourcePath: string
}

/**
 * 「待读论文」— papers imported (status: to-read) but not yet reviewed. Rotates
 * a window of 3 by date seed so the same few don't camp on the homepage, and
 * links each straight into the online editor to write the review.
 *
 * Data arrives as props from the server component (the list only changes on
 * rebuild); the date-seeded slice happens after mount to avoid a hydration
 * mismatch, same as every other date-dependent widget here.
 */
export function ToRead({ items }: { items: ToReadItem[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const shown = useMemo(() => {
    if (!mounted || items.length === 0) return []
    const start = dailyIndex(`toread:${todaySeed()}`, items.length)
    return [0, 1, 2].map((i) => items[(start + i) % items.length]).slice(0, Math.min(3, items.length))
  }, [mounted, items])

  if (items.length === 0) return null
  if (!mounted) {
    return <div className="min-h-36 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900" />
  }

  return (
    <div className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
          待读论文
        </span>
        <span className="text-xs text-neutral-400">共 {items.length} 篇未评价</span>
      </div>
      <ul className="mt-3 space-y-2.5">
        {shown.map((p) => (
          <li key={p.sourcePath} className="flex items-baseline gap-2">
            <Link href={p.href} className="min-w-0 flex-1 truncate text-sm hover:underline">
              {p.title}
            </Link>
            <span className="shrink-0 text-xs text-neutral-400">{p.year}</span>
            <Link
              href={{ pathname: '/editor/', query: { path: p.sourcePath } }}
              className="shrink-0 text-xs text-sky-600 hover:underline dark:text-sky-400"
            >
              编辑
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
