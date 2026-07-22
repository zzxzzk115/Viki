import type { Metadata } from 'next'
import { EnglishSession } from './english-session'

export const metadata: Metadata = {
  title: '单词',
  description: '用间隔重复背单词与拼写测验——独立于知识卡片的词汇轨道。',
}

export default function EnglishPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">背单词</h1>
      <p className="mt-2 text-sm text-neutral-500">
        用 <code className="text-xs">::::word</code> 写的词汇卡(独立于知识卡片)。间隔重复(SM-2)进度存本机,配置
        GitHub token 后与复习进度一起同步。
      </p>
      <EnglishSession />
    </main>
  )
}
