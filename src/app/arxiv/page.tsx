import Link from 'next/link'
import { FeedBrowser } from '@/components/feed-browser'
import { getFeed, getFeedDates } from '@/lib/content'

export const metadata = { title: 'arXiv 推荐' }

export default async function ArxivPage() {
  const [feed, dates] = await Promise.all([getFeed(), getFeedDates()])

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">arXiv 推荐</h1>
      <p className="mt-2 text-sm text-neutral-500">
        注视点 / 感知驱动渲染方向的近期论文，按相关度排序。
        每天由 GitHub Actions 抓取，配置见{' '}
        <a
          href="https://github.com/zzxzzk115/Viki/blob/master/config/feeds.ts"
          className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900 dark:decoration-neutral-600 dark:hover:text-neutral-100"
        >
          config/feeds.ts
        </a>
        。
      </p>

      {!feed ? (
        <p className="mt-10 rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          还没有抓取过。手动触发 <code className="text-xs">papers.yml</code> 或等定时任务跑。
        </p>
      ) : (
        <>
          <p className="mt-6 text-xs text-neutral-400">
            更新于 {feed.date} · {feed.papers.length} 篇 ·{' '}
            {feed.papers.filter((p) => p.isNew).length} 篇首次出现
          </p>

          {/* Surfaced rather than swallowed: a feed that quietly shrank because
              a provider was down should say so, not look like a quiet week. */}
          {feed.notes.length > 0 && (
            <details className="mt-3 text-xs text-neutral-400">
              <summary className="cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300">
                抓取备注 ({feed.notes.length})
              </summary>
              <ul className="mt-2 space-y-1 pl-4">
                {feed.notes.map((n, i) => (
                  <li key={i} className="list-disc">
                    {n}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <FeedBrowser papers={feed.papers} />
        </>
      )}

      {dates.length > 1 && (
        <section className="mt-12 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">历史</h2>
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {dates.slice(0, 30).map((d) => (
              <li key={d}>
                <Link
                  href={`/arxiv/history/${d}/`}
                  className="rounded bg-neutral-100 px-2 py-1 text-xs tabular-nums hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                >
                  {d}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
