'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { VENUE_TYPE_LABEL, type Paper } from '@/lib/schema'

type Entry = Omit<Paper, 'html' | 'text' | 'cards' | 'toc'>
type SortKey = 'year' | 'title' | 'venue' | 'rating'

const STATUS_LABEL: Record<string, string> = {
  'to-read': '待读',
  reading: '在读',
  read: '已读',
}

export function PapersTable({ papers }: { papers: Entry[] }) {
  const [year, setYear] = useState<number | null>(null)
  const [venue, setVenue] = useState<string | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('year')
  const [asc, setAsc] = useState(false)

  const years = useMemo(
    () => [...new Set(papers.map((p) => p.meta.year))].sort((a, b) => b - a),
    [papers],
  )
  // Group by the series, not the exact venue: 'SIGGRAPH Asia 2016' and
  // 'SIGGRAPH Asia 2012' are one filter, otherwise every paper is its own.
  const venues = useMemo(
    () => [...new Set(papers.map((p) => venueSeries(p.meta.venue)))].sort(),
    [papers],
  )
  const tags = useMemo(
    () => [...new Set(papers.flatMap((p) => p.meta.tags))].sort((a, b) => a.localeCompare(b, 'zh')),
    [papers],
  )

  const shown = useMemo(() => {
    const out = papers
      .filter((p) => year === null || p.meta.year === year)
      .filter((p) => venue === null || venueSeries(p.meta.venue) === venue)
      .filter((p) => tag === null || p.meta.tags.includes(tag))
    const dir = asc ? 1 : -1
    return [...out].sort((a, b) => {
      switch (sort) {
        case 'year':
          return (a.meta.year - b.meta.year) * dir
        case 'rating':
          return ((a.meta.rating ?? 0) - (b.meta.rating ?? 0)) * dir
        case 'venue':
          return a.meta.venue.localeCompare(b.meta.venue) * dir
        default:
          return a.meta.title.localeCompare(b.meta.title) * dir
      }
    })
  }, [papers, year, venue, tag, sort, asc])

  const toggleSort = (k: SortKey) => {
    if (sort === k) setAsc(!asc)
    else {
      setSort(k)
      setAsc(k === 'title' || k === 'venue')
    }
  }

  return (
    <>
      <div className="mt-8 space-y-3">
        <Row label="年份">
          <Chip active={year === null} onClick={() => setYear(null)}>
            全部
          </Chip>
          {years.map((y) => (
            <Chip key={y} active={year === y} onClick={() => setYear(year === y ? null : y)}>
              {y}
            </Chip>
          ))}
        </Row>
        <Row label="发表">
          <Chip active={venue === null} onClick={() => setVenue(null)}>
            全部
          </Chip>
          {venues.map((v) => (
            <Chip key={v} active={venue === v} onClick={() => setVenue(venue === v ? null : v)}>
              {v}
            </Chip>
          ))}
        </Row>
        <Row label="主题">
          <Chip active={tag === null} onClick={() => setTag(null)}>
            全部
          </Chip>
          {tags.map((t) => (
            <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
              {t}
            </Chip>
          ))}
        </Row>
      </div>

      <p className="mt-6 text-sm text-neutral-500">{shown.length} 篇</p>

      {/* Wide content scrolls inside its own box; the page body must not. */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-xs text-neutral-500 dark:border-neutral-700">
              <Th onClick={() => toggleSort('title')} active={sort === 'title'} asc={asc}>
                标题
              </Th>
              <Th onClick={() => toggleSort('venue')} active={sort === 'venue'} asc={asc}>
                发表于
              </Th>
              <Th onClick={() => toggleSort('year')} active={sort === 'year'} asc={asc}>
                年份
              </Th>
              <Th onClick={() => toggleSort('rating')} active={sort === 'rating'} asc={asc}>
                评分
              </Th>
              <th className="py-2 font-medium">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {shown.map((p) => (
              <tr key={p.slug} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                <td className="py-3 pr-4">
                  <Link href={p.href} className="font-medium hover:underline">
                    {p.meta.title}
                  </Link>
                  <div className="mt-0.5 text-xs text-neutral-400">
                    {shortAuthors(p.meta.authors)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.meta.tags.map((t) => (
                      <span key={t} className="text-xs text-neutral-400">
                        #{t}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3 pr-4 whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                  {venueSeries(p.meta.venue)}
                  {p.meta.venueType && (
                    <span className="ml-1.5 rounded bg-neutral-100 px-1 py-0.5 text-[0.65rem] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                      {VENUE_TYPE_LABEL[p.meta.venueType]}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 tabular-nums text-neutral-600 dark:text-neutral-400">
                  {p.meta.year}
                </td>
                <td className="py-3 pr-4 whitespace-nowrap text-amber-500">
                  {p.meta.rating ? '★'.repeat(p.meta.rating) : '—'}
                </td>
                <td className="py-3 whitespace-nowrap text-xs text-neutral-500">
                  {STATUS_LABEL[p.meta.status] ?? p.meta.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shown.length === 0 && (
        <p className="mt-8 text-center text-sm text-neutral-400">没有符合条件的论文</p>
      )}
    </>
  )
}

/** 'SIGGRAPH Asia 2016' -> 'SIGGRAPH Asia', so the filter groups a series. */
function venueSeries(venue: string): string {
  return venue.replace(/\s*(19|20)\d{2}\s*$/, '').trim() || venue
}

function shortAuthors(authors: string[]): string {
  if (authors.length === 0) return ''
  if (authors.length <= 2) return authors.join(', ')
  return `${authors[0]} 等 ${authors.length} 人`
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-8 shrink-0 text-xs text-neutral-400">{label}</span>
      {children}
    </div>
  )
}

function Th({
  onClick,
  active,
  asc,
  children,
}: {
  onClick: () => void
  active: boolean
  asc: boolean
  children: React.ReactNode
}) {
  return (
    <th className="py-2 font-medium">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-neutral-900 dark:hover:text-neutral-100 ${
          active ? 'text-neutral-900 dark:text-neutral-100' : ''
        }`}
      >
        {children}
        <span className="text-[0.6rem]">{active ? (asc ? '▲' : '▼') : ''}</span>
      </button>
    </th>
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
