'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAiConfig } from '@/components/ai-settings'
import { TokenQuickSet } from '@/components/token-settings'
import { chat, type ChatMessage } from '@/lib/ai'
import { withBase } from '@/lib/base-path'
import { ghCommitFile, ghLoadFile, readStoredToken } from '@/lib/github-edit'
import { buildChatSystem, buildDraftRequest, parseDraftResponse, validateDraftPath, type DraftProposal } from '@/lib/note-draft'
import { createPreview } from '@/lib/preview'
import type { ReadingItem } from '@/lib/reading-feed'
import type { Glossary } from '@/lib/schema'

/** Article context to seed the sidebar with (from a /read「问 AI」click). */
type SeedArticle = { title: string; summary: string; url: string }
const SEED_EVENT = 'viki:ai-seed'

/** Opens the AI sidebar preloaded with an article's context. Called from the
 *  reading page; the sidebar itself listens for the event so the two need no
 *  shared state. */
export function askAiAbout(item: Pick<ReadingItem, 'title' | 'summary' | 'url'>): void {
  window.dispatchEvent(new CustomEvent<SeedArticle>(SEED_EVENT, { detail: { title: item.title, summary: item.summary, url: item.url } }))
}

/**
 * Site-wide AI sidebar: ask about a topic, then optionally turn the exchange
 * into a note draft. The trust boundary is structural — the model only ever
 * proposes {path, meta, markdown}; the proposal passes the same path
 * whitelist the editor enforces, collisions are checked against the live
 * repo, and NOTHING is committed until the owner reviews the rendered draft
 * and presses 确认提交 (which uses the ordinary PAT commit path).
 *
 * Conversation lives in sessionStorage: a chat is a scratchpad, not a
 * record — anything worth keeping becomes a note.
 */

const CHAT_KEY = 'viki:chat'

interface DraftState {
  proposal: DraftProposal
  markdown: string
  previewHtml: string
  pathError: string | null
  exists: boolean | null // null = probing
}

type Phase = 'idle' | 'thinking' | 'drafting' | 'committing'

export function AiChat() {
  const cfg = useAiConfig()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [committed, setCommitted] = useState<{ path: string; url?: string } | null>(null)
  const [subjects, setSubjects] = useState<{ dir: string; name: string }[]>([])
  const glossaryRef = useRef<Glossary>({})
  const articleRef = useRef<SeedArticle | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // A /read「问 AI」click opens the drawer preloaded with the article.
  useEffect(() => {
    const onSeed = (e: Event) => {
      const article = (e as CustomEvent<SeedArticle>).detail
      articleRef.current = article
      setOpen(true)
      setDraft(null)
      setError('')
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `已载入《${article.title}》。基于它的摘要问我问题吧，聊完可以一键沉淀成笔记。` },
      ])
    }
    window.addEventListener(SEED_EVENT, onSeed)
    return () => window.removeEventListener(SEED_EVENT, onSeed)
  }, [])

  // System prompt, with the seeded article appended as grounding context.
  const systemWithArticle = useCallback(() => {
    const base = buildChatSystem(subjects.map((s) => s.dir))
    const a = articleRef.current
    return a
      ? `${base}\n\n用户正在读这篇文章，回答时可参考其摘要（不要编造摘要之外的内容）：\n标题：${a.title}\n摘要：${a.summary}\n链接：${a.url}`
      : base
  }, [subjects])

  // Restore session conversation once.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(CHAT_KEY) ?? '[]') as ChatMessage[]
      if (Array.isArray(saved)) setMessages(saved)
    } catch {}
  }, [])
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages))
    } catch {}
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  // Subjects + glossary load lazily on first open.
  useEffect(() => {
    if (!open || subjects.length > 0) return
    void fetch(withBase('/data/subjects.json'))
      .then((r) => (r.ok ? r.json() : []))
      .then(setSubjects)
      .catch(() => {})
    void fetch(withBase('/data/glossary.json'))
      .then((r) => (r.ok ? r.json() : {}))
      .then((g: Glossary) => {
        glossaryRef.current = g
      })
      .catch(() => {})
  }, [open, subjects.length])

  const send = useCallback(async () => {
    if (!cfg || !input.trim() || phase !== 'idle') return
    const next: ChatMessage[] = [...messages, { role: 'user', content: input.trim() }]
    setMessages(next)
    setInput('')
    setError('')
    setPhase('thinking')
    const r = await chat(cfg, next, { system: systemWithArticle() })
    setPhase('idle')
    if (!r.ok) {
      setError(r.message)
      setMessages(messages) // roll the user message back so retry re-sends it
      setInput(input)
      return
    }
    setMessages([...next, { role: 'assistant', content: r.text }])
  }, [cfg, input, phase, messages, systemWithArticle])

  const makeDraft = useCallback(async () => {
    if (!cfg || phase !== 'idle') return
    setError('')
    setCommitted(null)
    setPhase('drafting')
    const req = buildDraftRequest(
      messages,
      subjects.map((s) => s.dir),
      Object.keys(glossaryRef.current),
    )
    const r = await chat(cfg, req.messages, { system: req.system, maxTokens: 8192 })
    if (!r.ok) {
      setPhase('idle')
      setError(r.message)
      return
    }
    const parsed = parseDraftResponse(r.text, subjects.map((s) => s.dir))
    if (!parsed.ok) {
      setPhase('idle')
      setError(parsed.message)
      return
    }
    const render = createPreview({ glossary: glossaryRef.current, titles: {} })
    const previewHtml = await render(parsed.markdown)
    setDraft({ proposal: parsed.proposal, markdown: parsed.markdown, previewHtml, pathError: null, exists: null })
    setPhase('idle')
    void probePath(parsed.proposal.path)
  }, [cfg, phase, messages, subjects])

  const probePath = async (path: string) => {
    const r = await ghLoadFile(path)
    setDraft((d) =>
      d && d.proposal.path === path ? { ...d, exists: r.ok ? !('isNew' in r) : null } : d,
    )
  }

  const setPath = (path: string) => {
    const pathError = validateDraftPath(path, subjects.map((s) => s.dir))
    setDraft((d) => (d ? { ...d, proposal: { ...d.proposal, path }, pathError, exists: null } : d))
    if (!pathError) void probePath(path)
  }

  const commit = async () => {
    if (!draft || draft.pathError || draft.exists !== false) return
    const token = readStoredToken()
    if (!token) return
    setPhase('committing')
    setError('')
    const r = await ghCommitFile(draft.proposal.path, draft.markdown, null, `notes: add ${draft.proposal.path} (AI 草稿)`, token)
    setPhase('idle')
    if (!r.ok) {
      setError(`提交失败 (${r.status}): ${r.message}`)
      return
    }
    setCommitted({ path: draft.proposal.path, url: r.commitUrl })
    setDraft(null)
  }

  // Entry button renders nothing for visitors without an AI config.
  if (!cfg) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="AI 助手"
        className="fixed right-5 bottom-5 z-40 flex size-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-lg shadow-lg transition hover:scale-105 dark:border-neutral-700 dark:bg-neutral-900"
      >
        ✨
      </button>

      {open && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <span className="text-sm font-semibold">✨ AI 助手</span>
            <span className="text-xs text-neutral-400">
              {cfg.provider} · {cfg.model}
            </span>
            <button
              type="button"
              onClick={() => {
                setMessages([])
                setDraft(null)
                setCommitted(null)
                setError('')
              }}
              className="ml-auto text-xs text-neutral-400 underline decoration-dotted underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              清空
            </button>
            <button type="button" onClick={() => setOpen(false)} aria-label="关闭" className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
              ✕
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <p className="text-sm text-neutral-400">
                问一个知识点（比如「什么是 Z-fighting？」）。聊完可以一键把讨论沉淀成笔记草稿——你确认路径和内容后才会写进仓库。
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
                <div
                  className={`inline-block max-w-[92%] rounded-xl px-3.5 py-2 text-left text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                      : 'bg-neutral-100 dark:bg-neutral-800'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {phase === 'thinking' && <p className="text-xs text-neutral-400">思考中…</p>}
            {phase === 'drafting' && <p className="text-xs text-neutral-400">正在整理笔记草稿…</p>}
            {error && <p className="text-xs text-red-600 dark:text-red-400">✗ {error}</p>}
            {committed && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                ✓ 已提交 {committed.path}，部署约 1 分钟后上线。
                {committed.url && (
                  <>
                    {' '}
                    <a href={committed.url} target="_blank" rel="noopener noreferrer" className="underline">
                      查看 commit
                    </a>
                  </>
                )}{' '}
                <a href={withBase(`/editor/?path=${encodeURIComponent(committed.path)}`)} className="underline">
                  在编辑器中打开
                </a>
              </p>
            )}

            {draft && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/30" data-draft-panel>
                <p className="font-medium">📝 笔记草稿（未入库）</p>
                <label className="mt-2 block text-xs text-neutral-500">
                  路径（可改）
                  <input
                    type="text"
                    value={draft.proposal.path}
                    onChange={(e) => setPath(e.target.value.trim())}
                    className="mt-1 w-full rounded border border-neutral-300 bg-transparent px-2 py-1 font-mono text-xs outline-none focus:border-neutral-500 dark:border-neutral-700"
                  />
                </label>
                {draft.pathError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">✗ {draft.pathError}</p>}
                {draft.exists === true && <p className="mt-1 text-xs text-red-600 dark:text-red-400">✗ 该文件已存在，换个路径</p>}
                {draft.exists === null && !draft.pathError && <p className="mt-1 text-xs text-neutral-400">检查重名中…</p>}
                <p className="mt-1 text-xs text-neutral-500">
                  {draft.proposal.title} · {draft.proposal.level} · {draft.proposal.tags.join(' / ')}
                </p>
                <div
                  className="prose prose-neutral dark:prose-invert mt-2 max-h-64 max-w-none overflow-y-auto rounded-lg border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950"
                  dangerouslySetInnerHTML={{ __html: draft.previewHtml }}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {readStoredToken() ? (
                    <button
                      type="button"
                      disabled={!!draft.pathError || draft.exists !== false || phase === 'committing'}
                      onClick={commit}
                      className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
                    >
                      {phase === 'committing' ? '提交中…' : '确认提交'}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                      需要 GitHub token
                      <TokenQuickSet />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setDraft(null)}
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
            {messages.some((m) => m.role === 'assistant') && !draft && (
              <button
                type="button"
                disabled={phase !== 'idle'}
                onClick={makeDraft}
                className="mb-2 w-full rounded-lg border border-sky-300 py-1.5 text-xs text-sky-700 transition hover:bg-sky-50 disabled:opacity-40 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950"
              >
                📝 把讨论沉淀成笔记草稿
              </button>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="问一个知识点…"
                disabled={phase !== 'idle'}
                className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:opacity-60 dark:border-neutral-700"
              />
              <button
                type="submit"
                disabled={phase !== 'idle' || !input.trim()}
                className="shrink-0 rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
              >
                发送
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
