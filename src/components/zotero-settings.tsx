'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  readZoteroConfig,
  readZoteroDraft,
  saveZoteroConfig,
  zFetchCollections,
  ZOTERO_KEY,
  type ZoteroConfig,
} from '@/lib/zotero'

const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}
const getSnapshot = () => {
  try {
    return localStorage.getItem(ZOTERO_KEY) ?? ''
  } catch {
    return ''
  }
}
const getServerSnapshot = () => ''

export function useZoteroConfig(): ZoteroConfig | null {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return useMemo(() => {
    void raw
    return readZoteroConfig()
  }, [raw])
}

/**
 * Form-only lenient variant: readZoteroConfig returns null until BOTH fields
 * are filled, and rendering the inputs from it wiped whichever field was
 * typed first on every keystroke.
 */
function useZoteroDraft(): ZoteroConfig | null {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return useMemo(() => {
    void raw
    return readZoteroDraft()
  }, [raw])
}

type TestState = { phase: 'idle' } | { phase: 'busy' } | { phase: 'ok'; n: number } | { phase: 'bad'; message: string }

const EMPTY: ZoteroConfig = { v: 1, userId: '', apiKey: '' }

export function ZoteroSettings() {
  const stored = useZoteroConfig()
  const draft = useZoteroDraft()
  const cfg = draft ?? EMPTY
  const [test, setTest] = useState<TestState>({ phase: 'idle' })

  const update = (patch: Partial<ZoteroConfig>) => {
    const next = { ...cfg, ...patch }
    saveZoteroConfig(next.userId || next.apiKey ? next : null)
    setTest({ phase: 'idle' })
  }

  const configured = !!stored

  return (
    <div className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Zotero</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            configured
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
          }`}
        >
          {configured ? '已配置' : '未配置'}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-neutral-500">userID（数字，不是用户名）</span>
          <input
            type="text"
            value={cfg.userId}
            onChange={(e) => update({ userId: e.target.value.replace(/\D/g, '') })}
            placeholder="1234567"
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
          />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">API key（只读权限即可）</span>
          <input
            type="password"
            value={cfg.apiKey}
            onChange={(e) => update({ apiKey: e.target.value.replace(/\s+/g, '') })}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs">
        <button
          type="button"
          disabled={!configured || test.phase === 'busy'}
          onClick={async () => {
            if (!stored) return
            setTest({ phase: 'busy' })
            const r = await zFetchCollections(stored)
            setTest(r.ok ? { phase: 'ok', n: r.data.length } : { phase: 'bad', message: r.message })
          }}
          className="rounded border border-neutral-300 px-2.5 py-1 text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {test.phase === 'busy' ? '测试中…' : '测试'}
        </button>
        {draft && (
          <button
            type="button"
            onClick={() => {
              saveZoteroConfig(null)
              setTest({ phase: 'idle' })
            }}
            className="text-neutral-400 underline decoration-dotted underline-offset-2 hover:text-red-600 dark:hover:text-red-400"
          >
            清除
          </button>
        )}
        {test.phase === 'ok' && <span className="text-emerald-600 dark:text-emerald-400">✓ 可用（{test.n} 个收藏夹）</span>}
        {test.phase === 'bad' && <span className="text-red-600 dark:text-red-400">✗ {test.message}</span>}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-neutral-500">
        解锁论文页的「Zotero 导入」。在{' '}
        <a href="https://www.zotero.org/settings/keys" className="underline decoration-dotted underline-offset-2">
          zotero.org/settings/keys
        </a>{' '}
        创建只读 key，userID 显示在该页顶部。key 存在本机浏览器。
      </p>
    </div>
  )
}
