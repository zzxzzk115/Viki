'use client'

import { useState } from 'react'
import { TokenQuickSet } from '@/components/token-settings'
import type { DailyWordData } from '@/components/daily-word'
import { ghCommitFile, ghLoadFile, readStoredToken } from '@/lib/github-edit'

/** Collected daily words land here; build materializes them into vocab.json. */
const VOCAB_PATH = 'content/english/vocab/collected.md'

const FRONTMATTER = `---
title: 单词本 · 收藏
level: basic
tags: [英语, 单词]
summary: 从「每日单词」一键收藏的词,进入 /english 的单词轨道。
---

从主页「每日单词」点「加入单词本」收藏的词。

`

type State = 'idle' | 'busy' | 'done' | 'exists' | 'error' | 'need-token'

/** Builds a ::::word block from a daily word — Chinese meaning first (English
 *  in parens), bilingual example when available. */
function wordBlock(w: DailyWordData): string {
  const attrs = [w.ipa ? `ipa="${w.ipa}"` : '', w.pos ? `pos=${w.pos}` : ''].filter(Boolean).join(' ')
  const meaning = w.definitionZh
    ? `${w.definitionZh}${w.definition ? `（${w.definition}）` : ''}`
    : w.definition || '(补充释义)'
  const example = w.example ? `${w.example}${w.exampleZh ? `\n${w.exampleZh}` : ''}` : ''
  return [
    `::::word${attrs ? `{${attrs}}` : ''}`,
    w.word,
    '',
    ':::meaning',
    meaning,
    ':::',
    ...(example ? ['', ':::example', example, ':::'] : []),
    '::::',
    '',
  ].join('\n')
}

/**
 * 「加入单词本」: appends a ::::word block for today's word to collected.md.
 * A PAT push triggers deploy; build materializes it into vocab.json → the word
 * shows up in /english. Same token→load→dedup→commit flow as AddToBib.
 */
export function AddToVocab({ word }: { word: DailyWordData }) {
  const [state, setState] = useState<State>('idle')
  const [msg, setMsg] = useState('')

  const add = async () => {
    const token = readStoredToken()
    if (!token) {
      setState('need-token')
      return
    }
    setState('busy')
    const file = await ghLoadFile(VOCAB_PATH, token)
    if (!file.ok) {
      setState('error')
      setMsg(`读取失败 (${file.status})`)
      return
    }
    const existing = 'isNew' in file ? '' : file.text
    // Dedup: the headword already present (whole word, case-insensitive).
    if (new RegExp(`::::word[^\\n]*\\n${word.word}\\s*$`, 'im').test(existing)) {
      setState('exists')
      return
    }
    const base = existing.trim() ? existing : FRONTMATTER
    const next = `${base.replace(/\s*$/, '')}\n\n${wordBlock(word)}`
    const r = await ghCommitFile(
      VOCAB_PATH,
      next,
      'isNew' in file ? null : file.sha,
      `english: collect word "${word.word}"`,
      token,
    )
    if (r.ok) setState('done')
    else {
      setState('error')
      setMsg(`提交失败 (${r.status}): ${r.message}`)
    }
  }

  if (state === 'done') return <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ 已加入,部署后进入单词轨道</span>
  if (state === 'exists') return <span className="text-xs text-neutral-400">已在单词本</span>

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={add}
        disabled={state === 'busy'}
        className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 transition hover:border-neutral-400 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {state === 'busy' ? '提交中…' : '＋ 加入单词本'}
      </button>
      {state === 'error' && <span className="text-xs text-red-600 dark:text-red-400">{msg}</span>}
      {state === 'need-token' && (
        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
          需要 GitHub token（仅站主）
          <TokenQuickSet onSaved={() => setState('idle')} />
        </span>
      )}
    </span>
  )
}
