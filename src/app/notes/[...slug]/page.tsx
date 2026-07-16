import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Icon } from '@/components/icon'
import { LevelBadge } from '@/components/level-badge'
import { getNote, getNoteIndex, getSubjects } from '@/lib/content'
import type { TocEntry } from '@/lib/schema'

// Required by output: 'export' — every route must be enumerable at build time.
export const dynamicParams = false

export async function generateStaticParams() {
  const notes = await getNoteIndex()
  return notes.map((n) => ({ slug: n.slug.split('/') }))
}

// params is a Promise in Next 15+.
type Props = { params: Promise<{ slug: string[] }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const note = await getNote(slug.join('/')).catch(() => null)
  if (!note) return {}
  return { title: note.meta.title, description: note.meta.summary }
}

export default async function NotePage({ params }: Props) {
  const { slug } = await params
  const note = await getNote(slug.join('/')).catch(() => null)
  if (!note) notFound()

  const subjects = await getSubjects()
  const subject = subjects[note.subject]

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="lg:flex lg:gap-12">
        <article className="min-w-0 flex-1">
          <nav className="flex items-center gap-2 text-sm text-neutral-500">
            <Link href="/notes/" className="hover:underline">
              笔记
            </Link>
            <span>/</span>
            <Link
              href={`/subjects/${note.subject}/`}
              className="inline-flex items-center gap-1.5 hover:underline"
            >
              <Icon svg={subject?.iconSvg} className="size-3.5" />
              {subject?.name ?? note.subject}
            </Link>
          </nav>

          <h1 className="mt-4 text-3xl font-bold tracking-tight">{note.meta.title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
            <LevelBadge level={note.meta.level} />
            {note.meta.tags.map((t) => (
              <Link
                key={t}
                href={`/tags/${encodeURIComponent(t)}/`}
                className="rounded bg-neutral-100 px-2 py-0.5 text-xs hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
              >
                {t}
              </Link>
            ))}
            <span className="text-xs">约 {note.wordCount} 字</span>
          </div>

          {note.meta.summary && (
            <p className="mt-4 border-l-2 border-neutral-300 pl-4 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              {note.meta.summary}
            </p>
          )}

          {/* Prebuilt at build time from our own repo — shiki and KaTeX ran in
              Node and never reach the client. */}
          <div
            className="prose prose-neutral dark:prose-invert mt-8 max-w-none"
            dangerouslySetInnerHTML={{ __html: note.html }}
          />
        </article>

        {note.toc.length > 0 && <Toc toc={note.toc} />}
      </div>
    </div>
  )
}

function Toc({ toc }: { toc: TocEntry[] }) {
  return (
    <aside className="mt-12 shrink-0 lg:sticky lg:top-8 lg:mt-0 lg:h-fit lg:w-56">
      <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">目录</p>
      <ul className="mt-3 space-y-2 text-sm">
        {toc.map((t) => (
          <li key={t.id} style={{ paddingLeft: `${(t.depth - 2) * 0.75}rem` }}>
            <a
              href={`#${t.id}`}
              className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              {t.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  )
}
