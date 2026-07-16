'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Icon } from '@/components/icon'
import { LevelBadge } from '@/components/level-badge'
import { LEVELS, LEVEL_LABEL, type Level, type NoteIndexEntry, type Subject } from '@/lib/schema'

/**
 * The index is passed down from the server component as a prop rather than
 * fetched: it is body-less (title/tags/level only), so it stays small, and
 * prop-passing keeps the list server-rendered for the first paint.
 * Card and search data, which grow without bound, are runtime-fetched instead.
 */
export function NotesBrowser({
  notes,
  subjects,
}: {
  notes: NoteIndexEntry[]
  subjects: Record<string, Subject>
}) {
  const [subject, setSubject] = useState<string | null>(null)
  const [level, setLevel] = useState<Level | null>(null)
  const [tag, setTag] = useState<string | null>(null)

  const allSubjects = useMemo(
    () =>
      [...new Set(notes.map((n) => n.subject))].sort(
        (a, b) => (subjects[a]?.order ?? 99) - (subjects[b]?.order ?? 99),
      ),
    [notes, subjects],
  )
  const allTags = useMemo(
    () => [...new Set(notes.flatMap((n) => n.meta.tags))].sort((a, b) => a.localeCompare(b, 'zh')),
    [notes],
  )

  const shown = useMemo(
    () =>
      notes
        .filter((n) => !subject || n.subject === subject)
        .filter((n) => !level || n.meta.level === level)
        .filter((n) => !tag || n.meta.tags.includes(tag))
        .sort((a, b) => a.meta.title.localeCompare(b.meta.title, 'zh')),
    [notes, subject, level, tag],
  )

  return (
    <>
      <div className="mt-8 space-y-3">
        <FilterRow label="科目">
          <Chip active={!subject} onClick={() => setSubject(null)}>
            全部
          </Chip>
          {allSubjects.map((s) => (
            <Chip key={s} active={subject === s} onClick={() => setSubject(subject === s ? null : s)}>
              <Icon svg={subjects[s]?.iconSvg} className="size-3.5" />
              {subjects[s]?.name ?? s}
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label="程度">
          <Chip active={!level} onClick={() => setLevel(null)}>
            全部
          </Chip>
          {LEVELS.map((l) => (
            <Chip key={l} active={level === l} onClick={() => setLevel(level === l ? null : l)}>
              {LEVEL_LABEL[l]}
            </Chip>
          ))}
        </FilterRow>

        {allTags.length > 0 && (
          <FilterRow label="标签">
            <Chip active={!tag} onClick={() => setTag(null)}>
              全部
            </Chip>
            {allTags.map((t) => (
              <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                {t}
              </Chip>
            ))}
          </FilterRow>
        )}
      </div>

      <p className="mt-6 text-sm text-neutral-500">{shown.length} 篇</p>

      <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
        {shown.map((n) => (
          <li key={n.slug} className="py-4">
            <Link href={n.href} className="group block">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium group-hover:underline">{n.meta.title}</h2>
                <LevelBadge level={n.meta.level} />
              </div>
              {n.meta.summary && (
                <p className="mt-1 text-sm text-neutral-500">{n.meta.summary}</p>
              )}
              <div className="mt-1.5 flex items-center gap-2 text-xs text-neutral-400">
                <span className="inline-flex items-center gap-1">
                  <Icon svg={subjects[n.subject]?.iconSvg} className="size-3" />
                  {subjects[n.subject]?.name ?? n.subject}
                </span>
                {n.meta.tags.map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {shown.length === 0 && (
        <p className="mt-8 text-center text-sm text-neutral-400">没有符合条件的笔记</p>
      )}
    </>
  )
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-8 shrink-0 text-xs text-neutral-400">{label}</span>
      {children}
    </div>
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
