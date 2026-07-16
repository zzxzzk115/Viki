'use client'

import type MiniSearch from 'minisearch'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LevelBadge } from '@/components/level-badge'
import { withBase } from '@/lib/base-path'
import { loadIndex, type SearchDoc } from '@/lib/search'
import type { Level } from '@/lib/schema'

type Hit = SearchDoc & { score: number }

export function SearchUI() {
  const [q, setQ] = useState('')
  const [index, setIndex] = useState<MiniSearch<SearchDoc> | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    // Fetched, never imported: an imported index is inlined into the bundle and
    // would grow every page as the knowledge base grows.
    fetch(withBase('/data/search.json'))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        if (!alive) return
        setIndex(loadIndex(json))
        setState('ready')
      })
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    input.current?.focus()
  }, [state])

  const hits = useMemo(() => {
    if (!index || q.trim().length === 0) return []
    return index.search(q).slice(0, 30) as unknown as Hit[]
  }, [index, q])

  return (
    <>
      <div className="mt-6">
        <input
          ref={input}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={state === 'loading' ? '正在加载索引…' : '搜索笔记、论文、术语…'}
          disabled={state !== 'ready'}
          className="w-full rounded-lg border border-neutral-300 bg-transparent px-4 py-2.5 text-base outline-none placeholder:text-neutral-400 focus:border-neutral-500 disabled:opacity-50 dark:border-neutral-700 dark:focus:border-neutral-400"
        />
        <p className="mt-2 text-xs text-neutral-400">
          中英文都可以。术语的英文和缩写也进了索引 —— 搜 <code>radiance</code> 或{' '}
          <code>SVD</code> 能找到从没写过这些字母的中文笔记。
        </p>
      </div>

      {state === 'error' && (
        <p className="mt-8 text-sm text-red-600 dark:text-red-400">索引加载失败。</p>
      )}

      {state === 'ready' && q.trim() && (
        <>
          <p className="mt-6 text-sm text-neutral-500">{hits.length} 条结果</p>
          <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
            {hits.map((h) => (
              <li key={h.id} className="py-4">
                <Link href={h.href} className="group block">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium group-hover:underline">{h.title}</span>
                    {h.kind === 'paper' ? (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800">
                        论文
                      </span>
                    ) : (
                      <LevelBadge level={h.level as Level} />
                    )}
                  </div>
                  {h.summary && <p className="mt-1 text-sm text-neutral-500">{h.summary}</p>}
                </Link>
              </li>
            ))}
          </ul>
          {hits.length === 0 && (
            <p className="mt-8 text-center text-sm text-neutral-400">没有匹配的内容</p>
          )}
        </>
      )}
    </>
  )
}
