'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearch } from '@/lib/use-search'
import { SearchResults } from './search-results'

/**
 * Search from the nav: icon + ⌘K, results in a dialog.
 *
 * The index is only fetched once the dialog opens for the first time — it grows
 * with the knowledge base, so pulling it on every page view to power a button
 * nobody clicked would be a tax on the whole site.
 */
export function SearchDialog() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  // Sticky: once opened, keep the index rather than refetch on every reopen.
  const [everOpened, setEverOpened] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const { hits, state } = useSearch(q, everOpened)

  const show = useCallback(() => {
    setOpen(true)
    setEverOpened(true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        show()
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show])

  useEffect(() => {
    if (open) input.current?.focus()
    else setQ('')
  }, [open])

  // The page behind must not scroll while the dialog is up.
  useEffect(() => {
    if (!open) return
    const prior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prior
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label="搜索"
        className="ml-auto flex items-center gap-2 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-400 transition hover:border-neutral-300 hover:text-neutral-600 dark:border-neutral-800 dark:hover:border-neutral-700 dark:hover:text-neutral-300"
      >
        <MagnifierIcon />
        <span className="hidden sm:inline">搜索</span>
        <kbd className="hidden rounded border border-neutral-200 px-1 font-mono text-[0.65rem] sm:inline dark:border-neutral-700">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-neutral-900/40 p-4 backdrop-blur-sm sm:p-[10vh]"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="mx-auto max-w-xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="搜索"
          >
            <div className="flex items-center gap-3 border-b border-neutral-200 px-4 dark:border-neutral-800">
              <span className="text-neutral-400">
                <MagnifierIcon />
              </span>
              <input
                ref={input}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={state === 'loading' ? '正在加载索引…' : '搜索笔记、论文、术语…'}
                className="w-full bg-transparent py-3.5 text-base outline-none placeholder:text-neutral-400"
              />
              <kbd className="hidden rounded border border-neutral-200 px-1.5 py-0.5 font-mono text-[0.65rem] text-neutral-400 sm:inline dark:border-neutral-700">
                esc
              </kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {state === 'error' && (
                <p className="px-4 py-8 text-center text-sm text-red-600 dark:text-red-400">
                  索引加载失败
                </p>
              )}
              {state === 'ready' && q.trim() && hits.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-neutral-400">没有匹配的内容</p>
              )}
              {hits.length > 0 && <SearchResults hits={hits} onNavigate={() => setOpen(false)} compact />}
              {!q.trim() && state !== 'error' && (
                <p className="px-4 py-8 text-center text-xs text-neutral-400">
                  中英文都可以。搜 <code>radiance</code> 或 <code>SVD</code> 也能找到中文笔记。
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** lucide:search, inlined — a single piece of UI chrome does not need the
 *  build-time resolver that _subject.yml icons go through. */
function MagnifierIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}
