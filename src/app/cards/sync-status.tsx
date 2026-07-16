'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import { TokenQuickSet, useGithubToken } from '@/components/token-settings'
import {
  getSyncStateServerSnapshot,
  getSyncStateSnapshot,
  pushNow,
  subscribeSyncState,
  type SyncState,
} from '@/lib/srs-sync'
import { withBase } from '@/lib/base-path'

/**
 * One quiet line under the stats panel. Without a token it offers the
 * quick-set inline (progress syncs only for whoever can push — GitHub decides
 * that, not this UI); with one it narrates pull/push/merge state.
 */
export function SyncStatus() {
  const raw = useSyncExternalStore(subscribeSyncState, getSyncStateSnapshot, getSyncStateServerSnapshot)
  const state = useMemo(() => JSON.parse(raw) as SyncState, [raw])
  const { token } = useGithubToken()
  const [showSet, setShowSet] = useState(false)

  if (state.phase === 'off') {
    return (
      <div className="mt-3 text-xs text-neutral-400">
        <p className="flex items-center gap-2">
          <span className="inline-block size-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600" />
          进度只存在这台设备。配置 GitHub token 后自动同步到仓库（仅站主可写）。
          <button
            type="button"
            onClick={() => setShowSet((s) => !s)}
            className="underline decoration-dotted underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            {showSet ? '收起' : '快捷设置'}
          </button>
          <a
            href={withBase('/settings/')}
            className="underline decoration-dotted underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            设置页
          </a>
        </p>
        {showSet && !token && <TokenQuickSet onSaved={() => setShowSet(false)} />}
      </div>
    )
  }

  const label = {
    pulling: '正在从 GitHub 拉取进度…',
    pushing: '正在推送进度…',
    dirty: '有本地更改，稍后自动推送',
    synced: `已同步到 GitHub（data 分支）· ${'at' in state ? new Date(state.at).toLocaleTimeString() : ''}`,
    error: 'message' in state ? state.message : '同步出错',
  }[state.phase]

  return (
    <p className="mt-3 flex items-center gap-2 text-xs text-neutral-400">
      <span
        className={`inline-block size-1.5 rounded-full ${
          state.phase === 'error'
            ? 'bg-red-500'
            : state.phase === 'synced'
              ? 'bg-emerald-500'
              : 'bg-amber-400'
        }`}
      />
      {label}
      {(state.phase === 'dirty' || state.phase === 'error') && (
        <button
          type="button"
          onClick={() => void pushNow()}
          className="underline decoration-dotted underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          立即推送
        </button>
      )}
      <a
        href={withBase('/settings/')}
        className="ml-auto underline decoration-dotted underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-300"
      >
        设置
      </a>
    </p>
  )
}
