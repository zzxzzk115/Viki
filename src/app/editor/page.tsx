import { Suspense } from 'react'
import { EditorUI } from './editor-ui'

export const metadata = { title: '在线编辑' }

export default function EditorPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">在线编辑</h1>
      <p className="mt-2 text-sm text-neutral-500">
        轻量 Markdown 编辑器，直接提交到 GitHub。提交需要仓库写权限的 token——没有权限的访客只能预览。
      </p>
      {/* useSearchParams requires a Suspense boundary under static export. */}
      <Suspense fallback={<div className="mt-4 min-h-96 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900" />}>
        <EditorUI />
      </Suspense>
    </main>
  )
}
