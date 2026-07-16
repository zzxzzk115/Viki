'use client'

import { useState } from 'react'
import { Icon } from '@/components/icon'
import { ReviewCard } from '@/components/review-card'
import type { Subject } from '@/lib/schema'
import { QuizSession } from './quiz-session'
import { StatsPanel } from './stats-panel'
import { SyncStatus } from './sync-status'

type Mode = 'flip' | 'quiz'

export function CardsSession({ subjects }: { subjects: Record<string, Subject> }) {
  const [subject, setSubject] = useState<string | undefined>()
  const [mode, setMode] = useState<Mode>('flip')

  const dirs = Object.values(subjects).sort((a, b) => a.order - b.order)

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="mr-2 inline-flex overflow-hidden rounded-lg border border-neutral-300 text-sm dark:border-neutral-700">
          {(
            [
              ['flip', '翻卡'],
              ['quiz', '刷题'],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 transition ${
                mode === m
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <Chip active={!subject} onClick={() => setSubject(undefined)}>
          全部科目
        </Chip>
        {dirs.map((s) => (
          <Chip
            key={s.dir}
            active={subject === s.dir}
            onClick={() => setSubject(subject === s.dir ? undefined : s.dir)}
          >
            <Icon svg={s.iconSvg} className="size-3.5" />
            {s.name}
          </Chip>
        ))}
      </div>

      <div className="mt-6">
        {/* key forces a fresh pick/session when the filter changes. */}
        {mode === 'flip' ? (
          <ReviewCard key={subject ?? 'all'} subject={subject} />
        ) : (
          <QuizSession key={subject ?? 'all'} subject={subject} />
        )}
      </div>

      <div className="mt-6">
        <StatsPanel subject={subject} />
        <SyncStatus />
      </div>
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
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition ${
        active
          ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
      }`}
    >
      {children}
    </button>
  )
}
