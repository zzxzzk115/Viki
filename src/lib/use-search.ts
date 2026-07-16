'use client'

import type MiniSearch from 'minisearch'
import { useEffect, useMemo, useRef, useState } from 'react'
import { withBase } from './base-path'
import { loadIndex, type SearchDoc } from './search'

export type Hit = SearchDoc & { score: number }
export type SearchState = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Loads the prebuilt index and queries it.
 *
 * `enabled` gates the fetch so the nav's search button costs nothing until it
 * is opened — the index grows with the knowledge base, and it would otherwise
 * be pulled on every page view. It is fetched, never imported: Next inlines
 * imported JSON into the bundle, so an import would grow every page too.
 *
 * The effect deliberately depends only on `enabled`. Depending on `state` here
 * is self-defeating: setState('loading') re-runs the effect, whose cleanup
 * flips the in-flight guard, so the fetch resolves into a no-op and the index
 * never lands — silently, with no error, stuck on 「正在加载索引…」 forever.
 * A ref tracks the one-shot instead.
 */
export function useSearch(query: string, enabled = true) {
  const [index, setIndex] = useState<MiniSearch<SearchDoc> | null>(null)
  const [state, setState] = useState<SearchState>('idle')
  const started = useRef(false)

  useEffect(() => {
    if (!enabled || started.current) return
    started.current = true

    let alive = true
    setState('loading')
    fetch(withBase('/data/search.json'))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        if (!alive) return
        setIndex(loadIndex(json))
        setState('ready')
      })
      .catch(() => {
        if (!alive) return
        // Allow a retry on a later mount rather than wedging on one failure.
        started.current = false
        setState('error')
      })
    return () => {
      alive = false
    }
  }, [enabled])

  const hits = useMemo(() => {
    if (!index || query.trim().length === 0) return []
    return index.search(query).slice(0, 30) as unknown as Hit[]
  }, [index, query])

  return { hits, state }
}
