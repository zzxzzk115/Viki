import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FeedList } from '@/components/feed-list'
import { getFeedByDate, getFeedDates } from '@/lib/content'

export const dynamicParams = false

export async function generateStaticParams() {
  const dates = await getFeedDates()
  return dates.map((date) => ({ date }))
}

type Props = { params: Promise<{ date: string }> }

export async function generateMetadata({ params }: Props) {
  const { date } = await params
  return { title: `arXiv ${date}` }
}

export default async function HistoryPage({ params }: Props) {
  const { date } = await params
  const feed = await getFeedByDate(date)
  if (!feed) notFound()

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <nav className="text-sm text-neutral-500">
        <Link href="/arxiv/" className="hover:underline">
          arXiv 推荐
        </Link>
      </nav>
      <h1 className="mt-4 text-3xl font-bold tracking-tight tabular-nums">{date}</h1>
      <p className="mt-2 text-sm text-neutral-500">{feed.papers.length} 篇</p>
      <FeedList papers={feed.papers} />
    </main>
  )
}
