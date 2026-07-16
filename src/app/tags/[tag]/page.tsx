import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Icon } from '@/components/icon'
import { LevelBadge } from '@/components/level-badge'
import { getNoteIndex, getSubjects } from '@/lib/content'

export const dynamicParams = false

/** Derived from the union of all tags — adding a tag in frontmatter creates a route. */
export async function generateStaticParams() {
  const notes = await getNoteIndex()
  return [...new Set(notes.flatMap((n) => n.meta.tags))].map((tag) => ({ tag }))
}

type Props = { params: Promise<{ tag: string }> }

export async function generateMetadata({ params }: Props) {
  const { tag } = await params
  return { title: `#${decodeURIComponent(tag)}` }
}

export default async function TagPage({ params }: Props) {
  // Next percent-encodes non-ASCII params; Chinese tags arrive encoded.
  const tag = decodeURIComponent((await params).tag)
  const [notes, subjects] = await Promise.all([getNoteIndex(), getSubjects()])
  const mine = notes
    .filter((n) => n.meta.tags.includes(tag))
    .sort((a, b) => a.meta.title.localeCompare(b.meta.title, 'zh'))
  if (mine.length === 0) notFound()

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">#{tag}</h1>
      <p className="mt-2 text-neutral-500">{mine.length} 篇笔记</p>

      <ul className="mt-8 divide-y divide-neutral-200 dark:divide-neutral-800">
        {mine.map((n) => (
          <li key={n.slug} className="py-4">
            <Link href={n.href} className="group block">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium group-hover:underline">{n.meta.title}</span>
                <LevelBadge level={n.meta.level} />
              </div>
              {n.meta.summary && <p className="mt-1 text-sm text-neutral-500">{n.meta.summary}</p>}
              <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-neutral-400">
                <Icon svg={subjects[n.subject]?.iconSvg} className="size-3" />
                {subjects[n.subject]?.name ?? n.subject}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-12 text-sm">
        <Link href="/notes/" className="text-neutral-500 hover:underline">
          ← 全部笔记
        </Link>
      </p>
    </main>
  )
}
