'use client'

import type MiniSearch from 'minisearch'
import { useEffect, useMemo, useState } from 'react'
import { withBase } from './base-path'
import { loadIndex, type SearchDoc } from './search'

export type Hit = SearchDoc & { score: number }
export type SearchState = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Loads the prebuilt index and queries it.
 *
 * `enabled` gates the fetch so the nav's search button costs nothing until it
 * is opened — the index is ~30KB now but grows with the knowledge base, and it
 * would otherwise be pulled on every page view.
 *
 * The index is fetched, never imported: Next inlines imported JSON into the
 * bundle, so an import would grow every page as the corpus does.
 */
export function useSearch(query: string, enabled = true) {
  const [index, setIndex] = useState<MiniSearch<SearchDoc> | null>(null)
  const [state, setState] = useState<SearchState>('idle')

  useEffect(() => {
    if (!enabled || index || state === 'loading' || state === 'error') return
    let alive = true
    setState('loading')
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
  }, [enabled, index, state])

  const hits = useMemo(() => {
    if (!index || query.trim().length === 0) return []
    return index.search(query).slice(0, 30) as unknown as Hit[]
  }, [index, query])

  return { hits, state }
}
