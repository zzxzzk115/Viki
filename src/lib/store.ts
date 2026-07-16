'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { emptyStore, STORE_VERSION, type Store } from './srs'

const KEY = 'viki:srs:v1'

/**
 * localStorage bridge for the review store.
 *
 * The hydration trap this avoids is real: every page is prerendered at build
 * time, where localStorage does not exist. Reading it during render makes the
 * server HTML say 「新卡片」 and the client say 「3 张待复习」, which is a
 * hydration mismatch — React then either re-renders the subtree on the client
 * (a visible flash) or throws.
 *
 * useSyncExternalStore is built for exactly this, and beats useEffect+mounted
 * by giving cross-tab sync for free.
 */

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  // 'storage' only fires in *other* tabs, so same-tab writes notify via emit().
  window.addEventListener('storage', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}

const EMPTY_SNAPSHOT = '{}'

/** Must return a referentially stable value. Returning a fresh JSON.parse()
 *  object on every call is an infinite render loop — hence the raw string. */
function getSnapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? EMPTY_SNAPSHOT
  } catch {
    // Safari private mode and friends throw on access rather than return null.
    return EMPTY_SNAPSHOT
  }
}

/** Must be a module-level constant, not a new {} — same stability rule. */
function getServerSnapshot(): string {
  return EMPTY_SNAPSHOT
}

function parse(raw: string): Store {
  try {
    const data = JSON.parse(raw) as Partial<Store>
    if (data?.v !== STORE_VERSION || typeof data.cards !== 'object' || !data.cards) {
      // Versioned key means a future migration can hook in here instead of
      // silently reading a shape it does not understand.
      return emptyStore()
    }
    return data as Store
  } catch {
    return emptyStore()
  }
}

export function useSrsStore() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const store = useMemo(() => parse(raw), [raw])

  const save = useCallback((next: Store) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Quota or private mode: the review still works for this session.
    }
    emit()
    // Synthetic StorageEvent for listeners OUTSIDE this module's emit() set —
    // the sync agent watches this key, and same-tab setItem never fires the
    // real event (the spec fires it in other tabs only).
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
  }, [])

  return { store, save }
}

/** True once the client snapshot is live, so callers can hold a skeleton until then. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
}
