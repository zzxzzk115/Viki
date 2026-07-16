import type { FeedPaper } from '@/lib/papers-feed'
import { AddToBib } from './add-to-bib'

export function FeedList({ papers }: { papers: FeedPaper[] }) {
  return (
    <ul className="mt-6 space-y-6">
      {papers.map((p) => (
        <li key={p.id} className="border-b border-neutral-200 pb-6 last:border-0 dark:border-neutral-800">
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
            {p.isNew && (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                新
              </span>
            )}
            {p.kind === 'classic' && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                经典 · 被引 {p.citedBy}
              </span>
            )}
            {p.topic && (
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {p.topic}
              </span>
            )}
            <span className="tabular-nums">{p.published}</span>
            {p.categories.slice(0, 3).map((c) => (
              <span key={c} className="font-mono">
                {c}
              </span>
            ))}
            <span className="ml-auto" title="相关度，由 config/feeds.ts 的关键词权重算出">
              {p.score}
            </span>
          </div>

          <h3 className="mt-1.5 font-medium">
            <a href={p.url} className="hover:underline">
              {p.title}
            </a>
          </h3>

          <p className="mt-1 text-xs text-neutral-500">{shortAuthors(p.authors)}</p>

          <p className="mt-2 line-clamp-3 text-sm text-neutral-600 dark:text-neutral-400">
            {p.abstract}
          </p>

          {p.matched.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-1.5 text-xs text-neutral-400">
              {p.matched.slice(0, 6).map((m) => (
                <span key={m} className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
                  {m}
                </span>
              ))}
            </p>
          )}

          <p className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <a href={p.url} className="text-neutral-500 hover:underline">
              {p.source === 'arxiv' ? `arXiv:${p.id}` : '详情'}
            </a>
            {p.pdf && (
              <a href={p.pdf} className="text-neutral-500 hover:underline">
                PDF
              </a>
            )}
            {p.source === 'arxiv' && (
              <AddToBib
                paper={{ id: p.id, title: p.title, authors: p.authors, published: p.published, url: p.url }}
              />
            )}
          </p>
        </li>
      ))}
    </ul>
  )
}

function shortAuthors(authors: string[]): string {
  if (authors.length === 0) return ''
  if (authors.length <= 3) return authors.join(', ')
  return `${authors.slice(0, 3).join(', ')} 等 ${authors.length} 人`
}
