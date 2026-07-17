'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAiConfig } from '@/components/ai-settings'
import { chat } from '@/lib/ai'
import { fetchAbstract } from '@/lib/openalex'
import { buildBriefPrompt, mergeBrief, parseBriefMeta } from '@/lib/paper-brief'

type State =
  | { phase: 'idle' }
  | { phase: 'busy'; step: '摘要' | '生成' | '合并' }
  | { phase: 'done'; model: string; source: string }
  | { phase: 'error'; message: string }

/**
 * The AI-brief panel inside the editor. Generation NEVER commits: the merged
 * markdown lands in the editor (one undoable transaction), the live preview
 * updates, and the human uses the ordinary commit box after review.
 */
export function AiBriefPanel({
  getText,
  onFilled,
}: {
  /** Current editor text — read lazily so the panel doesn't re-render per keystroke. */
  getText: () => string
  onFilled: (merged: string) => void
}) {
  const cfg = useAiConfig()
  const [state, setState] = useState<State>({ phase: 'idle' })

  if (!cfg) {
    return (
      <p className="mb-4 rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">
        AI 导读需要先在{' '}
        <Link href="/settings/" className="underline decoration-dotted underline-offset-2">
          设置
        </Link>{' '}
        里配置 AI 提供商。
      </p>
    )
  }

  const run = async () => {
    const meta = parseBriefMeta(getText())
    if (!meta) {
      setState({ phase: 'error', message: '解析不出论文 frontmatter——这不是一张论文占位页？' })
      return
    }
    setState({ phase: 'busy', step: '摘要' })
    const abs = await fetchAbstract(meta)
    if (!abs.ok) {
      setState({ phase: 'error', message: abs.message })
      return
    }
    setState({ phase: 'busy', step: '生成' })
    const prompt = buildBriefPrompt({ ...meta, abstract: abs.abstract })
    const r = await chat(cfg, prompt.messages, { system: prompt.system })
    if (!r.ok) {
      setState({ phase: 'error', message: r.message })
      return
    }
    setState({ phase: 'busy', step: '合并' })
    const merged = mergeBrief(getText(), r.text)
    if (!merged.ok) {
      setState({ phase: 'error', message: merged.message })
      return
    }
    onFilled(merged.text)
    setState({
      phase: 'done',
      model: r.model,
      source: abs.abstract ? (abs.source === 'doi' ? 'OpenAlex（DOI）' : 'OpenAlex（标题匹配）') : '⚠ 无摘要，仅基于标题',
    })
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/50 px-4 py-3 text-sm dark:border-sky-900 dark:bg-sky-950/30">
      <span className="font-medium">✨ AI 导读</span>
      <button
        type="button"
        disabled={state.phase === 'busy'}
        onClick={run}
        className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {state.phase === 'busy' ? `${state.step}中…` : state.phase === 'done' ? '重新生成' : '生成导读'}
      </button>
      <span className="text-xs text-neutral-500">
        {state.phase === 'idle' && `${cfg.provider} · ${cfg.model} · 基于摘要生成 贡献/方法 初稿，评价永远留给人写`}
        {state.phase === 'busy' && '生成的初稿会填入编辑器，Ctrl+Z 可整体撤销'}
        {state.phase === 'done' && (
          <span className="text-emerald-600 dark:text-emerald-400">
            ✓ 已生成（{state.model} · 摘要来源：{state.source}）——请核对后再提交
          </span>
        )}
        {state.phase === 'error' && <span className="text-red-600 dark:text-red-400">✗ {state.message}</span>}
      </span>
    </div>
  )
}
