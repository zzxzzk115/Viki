import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Icon } from '@/components/icon'
import { LevelBadge } from '@/components/level-badge'
import { getBacklinks, getNote, getNoteIndex, getSubjects } from '@/lib/content'
import type { NoteIndexEntry, TocEntry } from '@/lib/schema'

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

  const [subjects, backlinks, index] = await Promise.all([
    getSubjects(),
    getBacklinks(),
    getNoteIndex(),
  ])
  const subject = subjects[note.subject]
  const linkedFrom = (backlinks[note.slug] ?? [])
    .map((s) => index.find((n) => n.slug === s))
    .filter((n): n is NoteIndexEntry => !!n)

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

          {linkedFrom.length > 0 && (
            <section className="mt-16 border-t border-neutral-200 pt-6 dark:border-neutral-800">
              <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                被引用于
              </h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {linkedFrom.map((n) => (
                  <li key={n.slug}>
                    <Link href={n.href} className="text-neutral-600 hover:underline dark:text-neutral-400">
                      {n.meta.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
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
