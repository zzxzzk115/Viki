import type { Metadata } from 'next'
import { getReading } from '@/lib/content'
import { ReadingBrowser } from './reading-browser'

export const metadata: Metadata = {
  title: '推荐阅读',
  description: '每日从英语学习、技术研究、通识文化三类源抓取的推荐读物——摘要在此，点击去原文。',
}

// Server component, build-time read (same as /arxiv): no CORS, no runtime
// dependency on the sources being up.
export default async function ReadPage() {
  const feed = await getReading()

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">推荐阅读</h1>
      <p className="mt-2 text-sm text-neutral-500">
        每日定时抓取,摘要在此、正文点击去原文。读到感兴趣的,可以「问 AI」深入,聊完还能一键沉淀成笔记。
        {feed?.date && <span className="ml-1 tabular-nums text-neutral-400">· {feed.date}</span>}
      </p>
      {!feed || feed.items.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          还没有推荐内容。定时任务(reading.yml)每天抓取一次;本地可 <code className="text-xs">pnpm data:pull</code> 拉取。
        </p>
      ) : (
        <ReadingBrowser items={feed.items} />
      )}
    </main>
  )
}
