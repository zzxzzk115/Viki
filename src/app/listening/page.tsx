import type { Metadata } from 'next'
import { ListeningSession } from './listening-session'

export const metadata: Metadata = {
  title: '听力听写',
  description: '真人音频听写——听句子,填出关键词。音频与例句来自 Tatoeba(CC-BY)。',
}

export default function ListeningPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">听力听写</h1>
      <p className="mt-2 text-sm text-neutral-500">
        听真人朗读的句子,填出被挖掉的关键词——练听力最有效的方式之一。音频与逐字稿来自{' '}
        <a href="https://tatoeba.org" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2">
          Tatoeba
        </a>
        (CC-BY),每天更新。
      </p>
      <ListeningSession />
    </main>
  )
}
