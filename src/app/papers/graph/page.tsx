import Link from 'next/link'
import { PaperGraph } from '@/components/paper-graph'

export const metadata = { title: '论文关系图' }

export default function PaperGraphPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <nav className="text-sm text-neutral-500">
        <Link href="/papers/" className="hover:underline">
          论文
        </Link>
      </nav>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">论文关系图</h1>
      <p className="mt-2 text-neutral-500">
        库内论文的引用网络，引用关系由 OpenAlex 按 DOI 拉取。同主题的论文会聚成簇。
      </p>
      <PaperGraph />
    </main>
  )
}
