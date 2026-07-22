'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { TokenQuickSet } from '@/components/token-settings'
import { useZoteroConfig } from '@/components/zotero-settings'
import { appendBibEntry, extractBibDois, splitBibEntries } from '@/lib/bibtex'
import { ghCommitFile, ghLoadFile, readStoredToken } from '@/lib/github-edit'
import { zFetchBibtex, zFetchCollections, zFetchItems, type ZoteroCollection, type ZoteroItemRow } from '@/lib/zotero'

const BIB_PATH = 'scratch/related-work.bib'
const REPO_ACTIONS = 'https://github.com/zzxzzk115/Viki/actions/workflows/import-papers.yml'

type Phase =
  | { step: 'collections' }
  | { step: 'items'; collection: ZoteroCollection }
  | { step: 'done'; imported: number; skipped: number; commitUrl?: string }

export function ImportUI() {
  const cfg = useZoteroConfig()
  const [phase, setPhase] = useState<Phase>({ step: 'collections' })
  const [collections, setCollections] = useState<ZoteroCollection[] | null>(null)
  const [items, setItems] = useState<ZoteroItemRow[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [existingDois, setExistingDois] = useState<Set<string> | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!cfg || collections) return
    void zFetchCollections(cfg).then((r) => (r.ok ? setCollections(r.data) : setError(r.message)))
  }, [cfg, collections])

  if (!cfg) {
    return (
      <p className="mt-8 rounded-xl border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
        先在{' '}
        <Link href="/settings/" className="underline decoration-dotted underline-offset-2">
          设置
        </Link>{' '}
        里配置 Zotero userID 和 API key。
      </p>
    )
  }

  const openCollection = async (c: ZoteroCollection) => {
    setError('')
    setItems(null)
    setSelected(new Set())
    setPhase({ step: 'items', collection: c })
    // Items and the current .bib in parallel — the bib powers 已在库 badges.
    const [itemsR, bibR] = await Promise.all([zFetchItems(cfg, c.key), ghLoadFile(BIB_PATH, readStoredToken() || undefined)])
    if (!itemsR.ok) {
      setError(itemsR.message)
      return
    }
    const dois = bibR.ok && !('isNew' in bibR) ? extractBibDois(bibR.text) : new Set<string>()
    setExistingDois(dois)
    setItems(itemsR.data)
    setHasMore(itemsR.hasMore ?? false)
    setSelected(new Set(itemsR.data.filter((i) => !i.doi || !dois.has(i.doi)).map((i) => i.key)))
  }

  const doImport = async () => {
    const token = readStoredToken()
    if (!token || selected.size === 0 || busy) return
    setBusy(true)
    setError('')
    const bibR = await zFetchBibtex(cfg, [...selected])
    if (!bibR.ok) {
      setBusy(false)
      setError(bibR.message)
      return
    }
    // Fresh sha + fresh dedup right before the commit: the bib can have moved
    // while the user browsed (another tab, CI), and a stale sha would 409.
    const fresh = await ghLoadFile(BIB_PATH, token)
    if (!fresh.ok) {
      setBusy(false)
      setError(`读取 .bib 失败 (${fresh.status}): ${fresh.message}`)
      return
    }
    const have = 'isNew' in fresh ? new Set<string>() : extractBibDois(fresh.text)
    const entries = splitBibEntries(bibR.data)
    const toAdd = entries.filter((e) => ![...extractBibDois(e)].some((d) => have.has(d)))
    const skipped = entries.length - toAdd.length
    if (toAdd.length === 0) {
      setBusy(false)
      setPhase({ step: 'done', imported: 0, skipped })
      return
    }
    let next = 'isNew' in fresh ? '' : fresh.text
    for (const e of toAdd) next = next ? appendBibEntry(next, e) : `${e}\n`
    const r = await ghCommitFile(BIB_PATH, next, 'isNew' in fresh ? null : fresh.sha, `papers: import ${toAdd.length} entries from Zotero`, token)
    setBusy(false)
    if (!r.ok) {
      const hint = r.status === 409 ? '——.bib 刚被别处改过，重试一次即可' : ''
      setError(`提交失败 (${r.status}): ${r.message}${hint}`)
      return
    }
    setPhase({ step: 'done', imported: toAdd.length, skipped, commitUrl: r.commitUrl })
  }

  if (phase.step === 'done') {
    return (
      <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="font-medium text-emerald-700 dark:text-emerald-300">
          ✓ 已提交 {phase.imported} 条{phase.skipped > 0 ? `（${phase.skipped} 条已在库，跳过）` : ''}
        </p>
        {phase.imported > 0 && (
          <p className="mt-2 text-xs text-neutral-500">
            CI 正在生成待读页（约 2 分钟）。
            {phase.commitUrl && (
              <>
                {' '}
                <a href={phase.commitUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  查看 commit
                </a>
              </>
            )}{' '}
            <a href={REPO_ACTIONS} target="_blank" rel="noopener noreferrer" className="underline">
              查看 Actions
            </a>
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setPhase({ step: 'collections' })
            setCollections(null)
          }}
          className="mt-4 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
        >
          继续导入
        </button>
      </div>
    )
  }

  return (
    <div className="mt-8">
      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">✗ {error}</p>}

      {phase.step === 'collections' && (
        <>
          <h2 className="text-sm font-semibold">选择收藏夹</h2>
          {!collections && !error && <p className="mt-3 text-sm text-neutral-400">加载中…</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {collections?.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => void openCollection(c)}
                className="rounded-xl border border-neutral-200 px-4 py-3 text-left text-sm transition hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
              >
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-xs text-neutral-400">{c.numItems} 条</span>
              </button>
            ))}
            {collections?.length === 0 && <p className="text-sm text-neutral-400">这个库里没有收藏夹。</p>}
          </div>
        </>
      )}

      {phase.step === 'items' && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => setPhase({ step: 'collections' })}
              className="text-neutral-400 underline decoration-dotted underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              ← 收藏夹
            </button>
            <span className="font-semibold">{phase.collection.name}</span>
            {hasMore && <span className="text-xs text-amber-600 dark:text-amber-400">仅显示最近 100 条</span>}
          </div>

          {!items && !error && <p className="mt-4 text-sm text-neutral-400">加载条目与现有 .bib…</p>}

          {items && (
            <>
              <div className="mt-3 flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setSelected(new Set(items.filter((i) => !i.doi || !existingDois?.has(i.doi)).map((i) => i.key)))
                  }
                  className="underline decoration-dotted underline-offset-2"
                >
                  全选新条目
                </button>
                <button type="button" onClick={() => setSelected(new Set())} className="underline decoration-dotted underline-offset-2">
                  清空
                </button>
                <span className="text-neutral-400">已选 {selected.size} 条</span>
              </div>
              <ul className="mt-3 divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {items.map((i) => {
                  const inLib = !!i.doi && !!existingDois?.has(i.doi)
                  return (
                    <li key={i.key} className={`flex items-start gap-3 px-4 py-2.5 text-sm ${inLib ? 'opacity-50' : ''}`}>
                      <input
                        type="checkbox"
                        className="mt-1"
                        disabled={inLib}
                        checked={selected.has(i.key)}
                        onChange={(e) => {
                          const s = new Set(selected)
                          if (e.target.checked) s.add(i.key)
                          else s.delete(i.key)
                          setSelected(s)
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium" title={i.title}>
                          {i.title}
                        </span>
                        <span className="text-xs text-neutral-400">
                          {i.creators} {i.year && `· ${i.year}`}
                        </span>
                      </span>
                      {inLib && <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800">已在库</span>}
                      {!i.doi && !inLib && (
                        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300" title="无 DOI，去重由 CI 按标题兜底">
                          无 DOI
                        </span>
                      )}
                    </li>
                  )
                })}
                {items.length === 0 && <li className="px-4 py-3 text-sm text-neutral-400">这个收藏夹是空的。</li>}
              </ul>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {readStoredToken() ? (
                  <button
                    type="button"
                    disabled={selected.size === 0 || busy}
                    onClick={() => void doImport()}
                    className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
                  >
                    {busy ? '导入中…' : `导入 ${selected.size} 条`}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                    提交需要 GitHub token
                    <TokenQuickSet />
                  </span>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
