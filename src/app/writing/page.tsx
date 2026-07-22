import type { Metadata } from 'next'
import Link from 'next/link'
import { WritingPractice } from './writing-practice'

export const metadata: Metadata = {
  title: '写作',
  description: '雅思 Task 2 与学术论文写作练习——写完让 AI 按评分标准批改。',
}

export default function WritingPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">写作练习</h1>
      <p className="mt-2 text-sm text-neutral-500">
        选一个题目写,写完让 AI 按雅思四项标准 / 学术语体批改——给分段、逐句改法、改写示范。批改需在{' '}
        <Link href="/settings/" className="underline decoration-dotted underline-offset-2">
          设置
        </Link>{' '}
        里配置 AI。草稿自动存本机。
      </p>
      <WritingPractice />
    </main>
  )
}
