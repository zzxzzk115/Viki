import Link from 'next/link'
import { getNoteIndex, getPaperIndex, getTerms } from '@/lib/content'

export const metadata = { title: '术语表' }

export default async function GlossaryPage() {
  const [terms, notes, papers] = await Promise.all([getTerms(), getNoteIndex(), getPaperIndex()])
  const docs = [...notes, ...papers]
  const title = (slug: string) => docs.find((d) => d.slug === slug)
  const href = (slug: string) => docs.find((d) => d.slug === slug)?.href

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">术语表</h1>
      <p className="mt-2 text-neutral-500">
        中英对照，笔记里的 <code className="text-xs">:term[…]</code> 从这里取值。
        共 {terms.length} 条。
      </p>

      <dl className="mt-10 divide-y divide-neutral-200 dark:divide-neutral-800">
        {terms.map((t) => (
          <div key={t.term} className="py-5" id={t.term}>
            <dt className="flex flex-wrap items-baseline gap-2">
              <span className="text-lg font-medium">{t.term}</span>
              <span className="font-mono text-sm text-neutral-500">{t.en}</span>
              {t.abbr && (
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  {t.abbr}
                </span>
              )}
              {t.aka.length > 0 && (
                <span className="text-xs text-neutral-400">又称 {t.aka.join('、')}</span>
              )}
            </dt>
            {t.def && (
              <dd className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400">{t.def}</dd>
            )}
            <dd className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {t.see && href(t.see) && (
                <Link href={href(t.see)!} className="text-neutral-500 hover:underline">
                  详见：{title(t.see)?.meta.title}
                </Link>
              )}
              <span className="text-neutral-400">
                出现在{' '}
                {t.usedIn.map((s, i) => (
                  <span key={s}>
                    {i > 0 && '、'}
                    {href(s) ? (
                      <Link href={href(s)!} className="hover:underline">
                        {title(s)?.meta.title}
                      </Link>
                    ) : (
                      s
                    )}
                  </span>
                ))}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </main>
  )
}
