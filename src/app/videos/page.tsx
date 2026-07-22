import type { Metadata } from 'next'
import Link from 'next/link'
import { AddVideo } from '@/components/add-video'
import { getNoteIndex } from '@/lib/content'
import { VideosBrowser } from './videos-browser'

export const metadata: Metadata = {
  title: '视频',
  description: '收藏的视频笔记——一视频一页,嵌入播放器 + 手写笔记。',
}

const PLATFORM_LABEL: Record<string, string> = { youtube: 'YouTube', bilibili: 'Bilibili' }

export default async function VideosPage() {
  const notes = await getNoteIndex()
  const videos = notes
    .filter((n) => n.meta.video)
    .sort((a, b) => (b.meta.created ? +new Date(b.meta.created) : 0) - (a.meta.created ? +new Date(a.meta.created) : 0))

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">视频笔记</h1>
      <p className="mt-2 text-sm text-neutral-500">
        收藏 B站/YouTube 视频,一视频一页——嵌入播放器 + 手写笔记(可标 <code className="text-xs">@时间戳</code> 跳转、写{' '}
        <code className="text-xs">::::card</code> 提炼卡片)。
      </p>

      <div className="mt-5 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="mb-2 text-xs font-medium text-neutral-500">收藏一个视频</p>
        <AddVideo />
      </div>

      {videos.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          还没有收藏的视频。粘贴一个链接开始,或在下方「推荐视频」里一键收藏。
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {videos.map((n) => (
            <li key={n.slug} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {PLATFORM_LABEL[n.meta.video!.platform] ?? n.meta.video!.platform}
                </span>
                {n.meta.video!.channel && <span>{n.meta.video!.channel}</span>}
              </div>
              <Link href={n.href} className="mt-1 block font-medium hover:underline">
                {n.meta.title}
              </Link>
              {n.meta.summary && <p className="mt-0.5 line-clamp-2 text-sm text-neutral-500">{n.meta.summary}</p>}
            </li>
          ))}
        </ul>
      )}

      <VideosBrowser />
    </main>
  )
}
