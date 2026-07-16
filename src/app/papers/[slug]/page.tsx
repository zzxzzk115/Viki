import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBacklinks, getNoteIndex, getPaper, getPaperIndex } from '@/lib/content'
import type { TocEntry } from '@/lib/schema'

export const dynamicParams = false

export async function generateStaticParams() {
  const papers = await getPaperIndex()
  // Paper slugs carry the 'papers/' prefix; the route segment is the rest.
  return papers.map((p) => ({ slug: p.slug.replace(/^papers\//, '') }))
}

type Props = { params: Promise<{ slug: string }> }

const STATUS_LABEL: Record<string, string> = {
  'to-read': '待读',
  reading: '在读',
  read: '已读',
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const paper = await getPaper(`papers/${slug}`).catch(() => null)
  if (!paper) return {}
  return { title: paper.meta.title, description: paper.meta.summary }
}

export default async function PaperPage({ params }: Props) {
  const { slug } = await params
  const paper = await getPaper(`papers/${slug}`).catch(() => null)
  if (!paper) notFound()

  const [backlinks, notes, papers] = await Promise.all([
    getBacklinks(),
    getNoteIndex(),
    getPaperIndex(),
  ])
  const all = [...notes, ...papers]
  const linkedFrom = (backlinks[paper.slug] ?? [])
    .map((s) => all.find((n) => n.slug === s))
    .filter((n): n is (typeof all)[number] => !!n)

  const m = paper.meta

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="lg:flex lg:gap-12">
        <article className="min-w-0 flex-1">
          <nav className="text-sm text-neutral-500">
            <Link href="/papers/" className="hover:underline">
              论文
            </Link>
          </nav>

          <h1 className="mt-4 text-3xl font-bold tracking-tight">{m.title}</h1>

          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
            {m.authors.join(', ')}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="rounded bg-neutral-100 px-2 py-1 font-medium dark:bg-neutral-800">
              {m.venue}
            </span>
            {m.rating && <span className="text-amber-500">{'★'.repeat(m.rating)}</span>}
            <span className="text-xs text-neutral-500">{STATUS_LABEL[m.status] ?? m.status}</span>
            {m.tags.map((t) => (
              <span key={t} className="text-xs text-neutral-400">
                #{t}
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            {m.arxiv && <Ext href={`https://arxiv.org/abs/${m.arxiv}`}>arXiv:{m.arxiv}</Ext>}
            {m.doi && <Ext href={`https://doi.org/${m.doi}`}>DOI</Ext>}
            {m.project && <Ext href={m.project}>项目主页</Ext>}
            {m.code && <Ext href={m.code}>代码</Ext>}
          </div>

          {m.summary && (
            <p className="mt-6 border-l-2 border-neutral-300 pl-4 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              {m.summary}
            </p>
          )}

          <div
            className="prose prose-neutral dark:prose-invert mt-8 max-w-none"
            dangerouslySetInnerHTML={{ __html: paper.html }}
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

        {paper.toc.length > 0 && <Toc toc={paper.toc} />}
      </div>
    </div>
  )
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-neutral-500 underline decoration-neutral-300 underline-offset-4 hover:text-neutral-900 dark:decoration-neutral-600 dark:hover:text-neutral-100"
    >
      {children}
    </a>
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
