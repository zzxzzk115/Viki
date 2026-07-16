'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import { REPO_NAME, REPO_OWNER, TOKEN_KEY } from '@/lib/github-edit'

/**
 * The one GitHub-token widget, shared by /settings and every feature that
 * needs the token (sync, 加入待读) as an inline quick-set. The token itself
 * stays where it always was — localStorage under TOKEN_KEY, same key the
 * editor reads — so configuring it in any one place configures it everywhere.
 *
 * Writes announce themselves with a synthetic StorageEvent: that is the same
 * channel real cross-tab changes arrive on, so listeners (the sync agent, the
 * editor, other mounted copies of this widget) need no second mechanism.
 */

const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}
const getSnapshot = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}
const getServerSnapshot = () => ''

export function useGithubToken() {
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const save = useCallback((t: string) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {}
    window.dispatchEvent(new StorageEvent('storage', { key: TOKEN_KEY }))
  }, [])
  return { token, save }
}

type TestState = { phase: 'idle' } | { phase: 'busy' } | { phase: 'ok' } | { phase: 'bad'; message: string }

/** 401 means the token itself is invalid; write permission can only be proven
 *  by an actual commit, so a passing test says "usable", not "can push". */
async function testToken(token: string): Promise<TestState> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
    })
    if (r.ok) return { phase: 'ok' }
    return { phase: 'bad', message: r.status === 401 ? 'token 无效（401）' : `HTTP ${r.status}` }
  } catch {
    return { phase: 'bad', message: '网络错误' }
  }
}

/** Inline token paste. A <span>, not a <form>, so it can legally sit inside
 *  phrasing content (the 加入待读 button row, the sync status line). */
export function TokenQuickSet({ onSaved }: { onSaved?: () => void }) {
  const { save } = useGithubToken()
  const [draft, setDraft] = useState('')
  const commit = () => {
    if (!draft.trim()) return
    save(draft.trim())
    setDraft('')
    onSaved?.()
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="password"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
        placeholder="github_pat_…"
        className="w-44 rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-500 dark:border-neutral-700"
      />
      <button
        type="button"
        onClick={commit}
        disabled={!draft.trim()}
        className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        保存
      </button>
    </span>
  )
}

export function TokenSettings() {
  const { token, save } = useGithubToken()
  const [test, setTest] = useState<TestState>({ phase: 'idle' })

  return (
    <div className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">GitHub token</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            token
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
          }`}
        >
          {token ? '已配置' : '未配置'}
        </span>
      </div>

      <input
        type="password"
        value={token}
        onChange={(e) => {
          save(e.target.value.trim())
          setTest({ phase: 'idle' })
        }}
        placeholder="github_pat_…"
        className="mt-3 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
      />

      <div className="mt-3 flex items-center gap-3 text-xs">
        <button
          type="button"
          disabled={!token || test.phase === 'busy'}
          onClick={async () => {
            setTest({ phase: 'busy' })
            setTest(await testToken(token))
          }}
          className="rounded border border-neutral-300 px-2.5 py-1 text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {test.phase === 'busy' ? '测试中…' : '测试'}
        </button>
        {token && (
          <button
            type="button"
            onClick={() => {
              save('')
              setTest({ phase: 'idle' })
            }}
            className="text-neutral-400 underline decoration-dotted underline-offset-2 hover:text-red-600 dark:hover:text-red-400"
          >
            清除
          </button>
        )}
        {test.phase === 'ok' && <span className="text-emerald-600 dark:text-emerald-400">✓ token 可用（写权限以首次提交为准）</span>}
        {test.phase === 'bad' && <span className="text-red-600 dark:text-red-400">✗ {test.message}</span>}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-neutral-500">
        在{' '}
        <a
          href="https://github.com/settings/personal-access-tokens/new"
          className="underline decoration-dotted underline-offset-2"
        >
          GitHub 设置
        </a>{' '}
        创建 fine-grained PAT：只授权 <code className="text-neutral-600 dark:text-neutral-300">{REPO_OWNER}/{REPO_NAME}</code>{' '}
        一个仓库、只给 Contents 读写权限。token 存在本机浏览器（localStorage），不上传到任何地方；
        没有它站点一切照常，只是编辑器提交、进度同步、加入待读不可用——写权限本身由 GitHub 锁死。
      </p>
    </div>
  )
}
