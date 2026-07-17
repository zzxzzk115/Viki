import type { Metadata } from 'next'
import { ImportUI } from './import-ui'

export const metadata: Metadata = {
  title: 'Zotero 导入',
  description: '从 Zotero 收藏夹勾选文献，去重后追加进 BibTeX，由 CI 生成待读页。',
}

export default function ImportPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Zotero 导入</h1>
      <p className="mt-2 text-sm text-neutral-500">
        勾选条目 → 追加进 <code>scratch/related-work.bib</code> → CI 自动生成待读页（约 2 分钟）。BibTeX
        由 Zotero 原样导出，去重按 DOI。
      </p>
      <ImportUI />
    </main>
  )
}
