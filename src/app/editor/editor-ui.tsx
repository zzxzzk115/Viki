'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { withBase } from '@/lib/base-path'
import {
  REPO_BRANCH,
  REPO_URL,
  TOKEN_KEY,
  ghCommitFile,
  ghLoadFile,
  readStoredToken,
} from '@/lib/github-edit'
import { AiBriefPanel } from '@/components/ai-brief-panel'
import { MarkdownEditor, type MarkdownEditorHandle } from '@/components/markdown-editor'
import { createPreview, type PreviewContext } from '@/lib/preview'

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; sha: string | null; isNew: boolean }
  | { phase: 'error'; message: string }

/**
 * Lightweight online editor: textarea + live preview, committing straight to
 * GitHub over the contents API.
 *
 * Only a valid PAT can commit — everyone else gets a working read/preview and a
 * disabled commit button. The path comes from ?path=, restricted to content/
 * and config-ish text files so the editor can't be pointed at arbitrary repo
 * files by a crafted link.
 */
export function EditorUI() {
  const params = useSearchParams()
  const path = params.get('path') ?? ''
  const validPath = /^(content|scratch)\/[\w\-./ ]+\.(md|mdx|yml|bib)$/.test(path) && !path.includes('..')
  // ?brief=1 (from the paper page's AI 导读 link) shows the brief panel; the
  // extra paper-path check makes hand-typed URLs on non-papers fail safe.
  const brief = params.get('brief') === '1' && /^content\/papers\//.test(path)

  const [text, setText] = useState('')
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' })
  const [dirty, setDirty] = useState(false)
  const [token, setToken] = useState('')
  const [message, setMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string; url?: string } | null>(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const previewRef = useRef<((md: string) => Promise<string>) | null>(null)
  const editorRef = useRef<MarkdownEditorHandle>(null)
  // Latest text for the brief panel to read lazily (a prop would re-render
  // the panel on every keystroke for no reason).
  const textRef = useRef('')
  textRef.current = text

  // Token lives in localStorage — read after mount only (SSR has no storage).
  useEffect(() => {
    setToken(readStoredToken())
  }, [])
  const saveToken = useCallback((t: string) => {
    // Whitespace-stripped like everywhere else: a line-wrapped paste puts a
    // newline in the Authorization header and fetch() throws before sending.
    const clean = t.replace(/\s+/g, '')
    setToken(clean)
    try {
      if (clean) localStorage.setItem(TOKEN_KEY, clean)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {}
  }, [])

  // File + preview context load once per path.
  useEffect(() => {
    if (!validPath) return
    let alive = true
    setLoad({ phase: 'loading' })
    ;(async () => {
      const stored = readStoredToken() || undefined
      const [file, glossary, titles] = await Promise.all([
        ghLoadFile(path, stored),
        fetch(withBase('/data/glossary.json')).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
        fetch(withBase('/data/titles.json')).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      ])
      if (!alive) return
      previewRef.current = createPreview({ glossary, titles } as PreviewContext)
      if (!file.ok) {
        setLoad({ phase: 'error', message: `加载失败 (${file.status}): ${file.message}` })
        return
      }
      setText(file.text)
      setMessage(`docs: update ${path}`)
      setLoad({ phase: 'ready', sha: file.sha, isNew: 'isNew' in file })
    })()
    return () => {
      alive = false
    }
  }, [path, validPath])

  // Debounced live preview.
  useEffect(() => {
    if (load.phase !== 'ready') return
    const id = setTimeout(async () => {
      if (previewRef.current) setPreviewHtml(await previewRef.current(text))
    }, 300)
    return () => clearTimeout(id)
  }, [text, load.phase])

  const commit = useCallback(async () => {
    if (load.phase !== 'ready' || !token) return
    setCommitting(true)
    setResult(null)
    const r = await ghCommitFile(path, text, load.sha, message || `docs: update ${path}`, token)
    setCommitting(false)
    if (r.ok) {
      setResult({ ok: true, text: '已提交，部署约 1 分钟后生效', url: r.commitUrl })
      setDirty(false)
      // Refresh the sha so a follow-up commit doesn't 409 on the stale one.
      const fresh = await ghLoadFile(path, token)
      if (fresh.ok && fresh.sha) setLoad({ phase: 'ready', sha: fresh.sha, isNew: false })
    } else {
      const hint =
        r.status === 401 || r.status === 403
          ? ' — token 无效或权限不足（需要 fine-grained PAT，仅授权本仓库 contents 读写）'
          : r.status === 409
            ? ' — 文件在别处被改过，复制你的修改、刷新后重试'
            : ''
      setResult({ ok: false, text: `提交失败 (${r.status}): ${r.message}${hint}` })
    }
  }, [load, token, path, text, message])

  if (!validPath) {
    return (
      <p className="mt-10 rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
        缺少或非法的 <code>?path=</code> 参数。请从笔记/论文页的「在线编辑」进入。
      </p>
    )
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <code className="rounded bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800">{path}</code>
        {load.phase === 'ready' && load.isNew && (
          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            新文件
          </span>
        )}
        {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">未提交的修改</span>}
      </div>

      {load.phase === 'loading' && (
        <div className="mt-4 min-h-96 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900" />
      )}
      {load.phase === 'error' && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{load.message}</p>
      )}

      {load.phase === 'ready' && (
        <>
          {brief && (
            <div className="mt-4">
              <AiBriefPanel
                getText={() => textRef.current}
                onFilled={(merged) => editorRef.current?.setValue(merged)}
              />
            </div>
          )}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <MarkdownEditor
              ref={editorRef}
              initialValue={text}
              onChange={(v) => {
                setText(v)
                setDirty(true)
              }}
            />
            <div
              className="prose prose-neutral dark:prose-invert max-h-[70vh] min-h-[32rem] max-w-none overflow-y-auto rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            Ctrl+B 加粗 · Ctrl+I 斜体 · Ctrl+K 链接 · 预览与站点渲染一致（卡片 / 术语 / 公式 /
            wiki-link），唯一差别是代码块不做高亮。
          </p>

          <div className="mt-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-neutral-500">
                  GitHub token（fine-grained PAT，仅本仓库 contents 读写；存在本机浏览器）
                </span>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => saveToken(e.target.value.trim())}
                  placeholder="github_pat_…"
                  className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
                />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">提交信息</span>
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={commit}
                disabled={!token || committing || !dirty}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              >
                {committing ? '提交中…' : `提交到 ${REPO_BRANCH}`}
              </button>
              {!token && (
                <span className="text-xs text-neutral-400">
                  没有 token 只能预览。仓库所有者在{' '}
                  <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer" className="underline">
                    GitHub 设置
                  </a>{' '}
                  创建；其他人请走{' '}
                  <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline">
                    fork + PR
                  </a>
                  。
                </span>
              )}
              {result && (
                <span className={`text-xs ${result.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {result.text}
                  {result.url && (
                    <>
                      {' '}
                      <a href={result.url} target="_blank" rel="noopener noreferrer" className="underline">
                        查看 commit
                      </a>
                    </>
                  )}
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
