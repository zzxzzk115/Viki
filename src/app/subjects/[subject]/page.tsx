import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Icon } from '@/components/icon'
import { LevelBadge } from '@/components/level-badge'
import { getNoteIndex, getSubjects } from '@/lib/content'
import { LEVELS } from '@/lib/schema'

export const dynamicParams = false

/** Derived from the content tree — a new content/<dir>/ becomes a route with no config. */
export async function generateStaticParams() {
  const notes = await getNoteIndex()
  return [...new Set(notes.map((n) => n.subject))].map((subject) => ({ subject }))
}

type Props = { params: Promise<{ subject: string }> }

export async function generateMetadata({ params }: Props) {
  const { subject } = await params
  const subjects = await getSubjects()
  return { title: subjects[subject]?.name ?? subject }
}

export default async function SubjectPage({ params }: Props) {
  const { subject } = await params
  const [notes, subjects] = await Promise.all([getNoteIndex(), getSubjects()])
  const mine = notes.filter((n) => n.subject === subject)
  if (mine.length === 0) notFound()

  const meta = subjects[subject]

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
        <Icon svg={meta?.iconSvg} className="size-7 text-neutral-400" />
        {meta?.name ?? subject}
      </h1>
      <p className="mt-2 text-neutral-500">{mine.length} 篇笔记</p>

      {/* Grouped by level so the basic → advanced progression is the page's shape. */}
      {LEVELS.map((level) => {
        const group = mine
          .filter((n) => n.meta.level === level)
          .sort((a, b) => a.meta.title.localeCompare(b.meta.title, 'zh'))
        if (group.length === 0) return null
        return (
          <section key={level} className="mt-10">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-neutral-500 uppercase">
              <LevelBadge level={level} />
              <span className="text-neutral-400">{group.length} 篇</span>
            </h2>
            <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
              {group.map((n) => (
                <li key={n.slug} className="py-3">
                  <Link href={n.href} className="group block">
                    <span className="font-medium group-hover:underline">{n.meta.title}</span>
                    {n.meta.summary && (
                      <p className="mt-0.5 text-sm text-neutral-500">{n.meta.summary}</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <p className="mt-12 text-sm">
        <Link href="/notes/" className="text-neutral-500 hover:underline">
          ← 全部笔记
        </Link>
      </p>
    </main>
  )
}
