'use client'

import { useEffect } from 'react'
import { TOKEN_KEY } from '@/lib/github-edit'
import { pullAndMerge, pushIfDirty, schedulePush } from '@/lib/srs-sync'

/**
 * Invisible sync driver, mounted once in the root layout so reviews done
 * inline on note pages sync too, not just /cards. Does nothing at all when
 * no token is configured (i.e. for every visitor except the owner).
 */
export function SrsSyncAgent() {
  useEffect(() => {
    void pullAndMerge()

    // Both stores announce writes via StorageEvent (same-tab and cross-tab);
    // a token appearing (quick-set on any page) starts syncing right away.
    const onChange = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY) void pullAndMerge()
      else if (e.key === null || e.key === 'viki:srs:v1' || e.key === 'viki:quiz:v1' || e.key === 'viki:vocab:v1')
        schedulePush()
    }
    window.addEventListener('storage', onChange)

    // Last chance on tab close — best-effort (the request may be cut short,
    // but nothing is lost: localStorage still has it for the next session).
    const onHide = () => pushIfDirty()
    window.addEventListener('pagehide', onHide)

    return () => {
      window.removeEventListener('storage', onChange)
      window.removeEventListener('pagehide', onHide)
    }
  }, [])

  return null
}
