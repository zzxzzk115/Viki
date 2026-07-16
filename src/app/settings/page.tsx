import type { Metadata } from 'next'
import { TokenSettings } from '@/components/token-settings'

export const metadata: Metadata = {
  title: '设置',
  description: 'GitHub token 等本机配置。',
}

/**
 * All configuration here is per-BROWSER (localStorage), because a static site
 * has nowhere else to put it — which is also the privacy story: nothing typed
 * on this page leaves the machine except requests to GitHub's API signed with
 * the token itself.
 */
export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">设置</h1>
      <p className="mt-2 text-sm text-neutral-500">配置存在本机浏览器里，换设备需要重新配置。</p>

      <div className="mt-8 space-y-6">
        <TokenSettings />

        <div className="rounded-xl border border-neutral-200 p-5 text-sm leading-relaxed text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">token 解锁什么</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
            <li>在线编辑器：笔记/论文直接提交回仓库（普通 push，自动触发部署）</li>
            <li>复习进度同步：SM-2 进度与刷题统计提交到 data 分支，换设备自动合并（注意：仓库公开，进度数据也公开——只是复习日期和难度系数，无笔记内容）</li>
            <li>arXiv 推荐「加入待读」：BibTeX 追加 + CI 生成待读页</li>
          </ul>
        </div>
      </div>
    </main>
  )
}
