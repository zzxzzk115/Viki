'use client'

import { useEffect, useRef, useState } from 'react'
import { SearchResults } from '@/components/search-results'
import { useSearch } from '@/lib/use-search'

/** The deep-linkable page. The nav dialog shares useSearch and SearchResults,
 *  so the two cannot drift apart. */
export function SearchUI() {
  const [q, setQ] = useState('')
  const { hits, state } = useSearch(q)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state === 'ready') input.current?.focus()
  }, [state])

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
          <code>SVD</code> 能找到从没写过这些字母的中文笔记。导航栏的 <kbd>⌘K</kbd> 也能搜。
        </p>
      </div>

      {state === 'error' && (
        <p className="mt-8 text-sm text-red-600 dark:text-red-400">索引加载失败。</p>
      )}

      {state === 'ready' && q.trim() && (
        <>
          <p className="mt-6 text-sm text-neutral-500">{hits.length} 条结果</p>
          <div className="mt-3">
            <SearchResults hits={hits} />
          </div>
          {hits.length === 0 && (
            <p className="mt-8 text-center text-sm text-neutral-400">没有匹配的内容</p>
          )}
        </>
      )}
    </>
  )
}
