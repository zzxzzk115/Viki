'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAiConfig } from '@/components/ai-settings'
import { chat } from '@/lib/ai'
import { createPreview } from '@/lib/preview'
import { buildFeedbackPrompt, countWords, WRITING_PROMPTS, type WritingMode, type WritingPrompt } from '@/lib/writing'

const DRAFT_KEY = 'viki:writing:v1'
const renderMd = createPreview({ glossary: {}, titles: {} })

type Feedback = { phase: 'idle' } | { phase: 'busy' } | { phase: 'done'; html: string } | { phase: 'error'; message: string }

/**
 * Write against a prompt, then grade with the configured AI (IELTS band
 * criteria or academic style). Drafts persist per prompt in localStorage so a
 * refresh never loses work; the AI feedback renders through the site's own
 * markdown pipeline.
 */
export function WritingPractice() {
  const cfg = useAiConfig()
  const [mode, setMode] = useState<WritingMode>('ielts')
  const prompts = useMemo(() => WRITING_PROMPTS.filter((p) => p.mode === mode), [mode])
  const [promptId, setPromptId] = useState(prompts[0]?.id ?? '')
  const prompt = useMemo(() => WRITING_PROMPTS.find((p) => p.id === promptId) ?? prompts[0], [promptId, prompts])
  const [text, setText] = useState('')
  const [fb, setFb] = useState<Feedback>({ phase: 'idle' })
  const drafts = useRef<Record<string, string>>({})

  // Load all drafts once.
  useEffect(() => {
    try {
      drafts.current = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')
    } catch {}
  }, [])

  // Swap the textarea to the selected prompt's draft.
  useEffect(() => {
    if (prompt) setText(drafts.current[prompt.id] ?? '')
    setFb({ phase: 'idle' })
  }, [prompt])

  const onModeChange = (m: WritingMode) => {
    setMode(m)
    const first = WRITING_PROMPTS.find((p) => p.mode === m)
    if (first) setPromptId(first.id)
  }

  const save = (v: string) => {
    setText(v)
    if (!prompt) return
    drafts.current[prompt.id] = v
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts.current))
    } catch {}
  }

  const grade = async () => {
    if (!cfg || !prompt || !text.trim()) return
    setFb({ phase: 'busy' })
    const req = buildFeedbackPrompt(prompt, text)
    const r = await chat(cfg, req.messages, { system: req.system, maxTokens: 4096 })
    if (!r.ok) {
      setFb({ phase: 'error', message: r.message })
      return
    }
    setFb({ phase: 'done', html: await renderMd(r.text) })
  }

  if (!prompt) return null
  const words = countWords(text)
  const short = words < prompt.minWords

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-neutral-300 text-sm dark:border-neutral-700">
          {(
            [
              ['ielts', '雅思 Task 2'],
              ['academic', '学术写作'],
            ] as [WritingMode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={`px-4 py-1.5 transition ${
                mode === m
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={promptId}
          onChange={(e) => setPromptId(e.target.value)}
          className="rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
        >
          {prompts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      <p className="mt-4 rounded-xl border-l-2 border-sky-400 bg-neutral-50 p-4 text-sm leading-relaxed dark:bg-neutral-900">
        {prompt.prompt}
      </p>

      <textarea
        value={text}
        onChange={(e) => save(e.target.value)}
        placeholder="在这里写……"
        className="mt-4 min-h-[22rem] w-full resize-y rounded-xl border border-neutral-300 bg-transparent p-4 text-sm leading-relaxed outline-none focus:border-neutral-500 dark:border-neutral-700"
      />
      <div className="mt-1 flex items-center gap-3 text-xs">
        <span className={short ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-400'}>
          {words} 词{short ? `（建议 ≥ ${prompt.minWords}）` : ''}
        </span>
        <span className="ml-auto" />
        {cfg ? (
          <button
            type="button"
            onClick={grade}
            disabled={fb.phase === 'busy' || !text.trim()}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {fb.phase === 'busy' ? '批改中…' : '✨ AI 批改'}
          </button>
        ) : (
          <span className="text-neutral-400">
            批改需先在{' '}
            <Link href="/settings/" className="underline decoration-dotted underline-offset-2">
              设置
            </Link>{' '}
            配置 AI
          </span>
        )}
      </div>

      {fb.phase === 'error' && <p className="mt-4 text-sm text-red-600 dark:text-red-400">✗ {fb.message}</p>}
      {fb.phase === 'done' && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">AI 批改</h2>
          <div
            className="prose prose-neutral dark:prose-invert mt-3 max-w-none rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"
            dangerouslySetInnerHTML={{ __html: fb.html }}
          />
          <p className="mt-2 text-xs text-neutral-400">AI 评分仅供参考,以真实考官/导师标准为准。</p>
        </section>
      )}
    </div>
  )
}
