import type { Metadata } from 'next'
import { AiSettings } from '@/components/ai-settings'
import { TokenSettings } from '@/components/token-settings'
import { ZoteroSettings } from '@/components/zotero-settings'

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
        <AiSettings />
        <ZoteroSettings />

        <div className="rounded-xl border border-neutral-200 p-5 text-sm leading-relaxed text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">各项配置解锁什么</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
            <li>GitHub token：在线编辑器提交、复习进度同步到 data 分支（注意：仓库公开，进度数据也公开——只是复习日期和难度系数）、arXiv 推荐「加入待读」、AI 草稿入库、Zotero 导入提交</li>
            <li>AI 助手：待读论文页的「AI 导读」（摘要生成初稿填入编辑器，人工核对后提交）、全站侧边栏问答与笔记草稿生成</li>
            <li>Zotero：/import 页从 Zotero 收藏夹勾选文献、去重后追加进 .bib，CI 自动生成待读页</li>
          </ul>
        </div>
      </div>
    </main>
  )
}
