import type { Metadata } from 'next'
import { ListeningSession } from './listening-session'

export const metadata: Metadata = {
  title: '听力听写',
  description: '真实新闻广播听写——每段只播一小节,可调语速,填出关键词。音频与逐字稿来自 VOA Learning English（美国政府公共领域）,每天更新。',
}

export default function ListeningPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">听力听写</h1>
      <p className="mt-2 text-sm text-neutral-500">
        听真实新闻/专题广播,每段只播一小节(约 20–30 秒),填出被挖掉的关键词——真实语料、可调语速。音频与逐字稿来自{' '}
        <a
          href="https://learningenglish.voanews.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2"
        >
          VOA Learning English
        </a>
        （美国政府公共领域,语速放慢便于学习）,每天更新。
      </p>
      <ListeningSession />
    </main>
  )
}
