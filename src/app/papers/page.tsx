import Link from 'next/link'
import { getPaperIndex } from '@/lib/content'
import { PapersTable } from './papers-table'

export const metadata = { title: '论文' }

export default async function PapersPage() {
  const papers = await getPaperIndex()

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl font-bold tracking-tight">论文</h1>
        <Link href="/papers/graph/" className="text-sm text-neutral-500 hover:underline">
          关系图 →
        </Link>
      </div>
      <p className="mt-2 text-neutral-500">读过的论文、它们的贡献，以及我的评价。</p>
      <PapersTable papers={papers} />
    </main>
  )
}
