'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { emptyStore, STORE_VERSION, type Store } from './srs'

/**
 * localStorage bridge for the vocabulary review store — a second, independent
 * SM-2 store keyed separately from knowledge cards (viki:srs:v1). Same shape,
 * same engine (srs.ts), different key so words and knowledge never share a
 * review pile. Cloned from store.ts; quiz-store.ts is the precedent for a
 * parallel store.
 */

const KEY = 'viki:vocab:v1'

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  window.addEventListener('storage', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}

const EMPTY_SNAPSHOT = '{}'
function getSnapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? EMPTY_SNAPSHOT
  } catch {
    return EMPTY_SNAPSHOT
  }
}
const getServerSnapshot = () => EMPTY_SNAPSHOT

function parse(raw: string): Store {
  try {
    const data = JSON.parse(raw) as Partial<Store>
    if (data?.v !== STORE_VERSION || typeof data.cards !== 'object' || !data.cards) return emptyStore()
    return data as Store
  } catch {
    return emptyStore()
  }
}

export function useVocabStore() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const store = useMemo(() => parse(raw), [raw])

  const save = useCallback((next: Store) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {}
    emit()
    // Same synthetic event as store.ts: the sync agent listens for this key.
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
  }, [])

  return { store, save }
}
