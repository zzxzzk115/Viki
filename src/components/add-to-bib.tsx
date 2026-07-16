'use client'

import { useState } from 'react'
import { appendBibEntry, bibHasArxivId, buildArxivBibEntry, type ArxivPaperRef } from '@/lib/bibtex'
import { ghCommitFile, ghLoadFile, readStoredToken } from '@/lib/github-edit'
import { TokenQuickSet } from '@/components/token-settings'

const BIB_PATH = 'scratch/related-work.bib'

type State = 'idle' | 'busy' | 'done' | 'exists' | 'error' | 'need-token'

/**
 * 「加入待读」on a feed paper: appends its BibTeX entry to the .bib and lets CI
 * (import-papers.yml, triggered by the push) run import-bibtex to materialize
 * the to-read placeholder page — the same pipeline that seeded the library, so
 * the .bib stays the single source of truth.
 *
 * Uses the same PAT the editor stores. Without one the button explains itself
 * instead of failing silently; GitHub enforces the actual permission either way.
 */
export function AddToBib({ paper }: { paper: ArxivPaperRef }) {
  const [state, setState] = useState<State>('idle')
  const [msg, setMsg] = useState('')

  const add = async () => {
    const token = readStoredToken()
    if (!token) {
      // Inline quick-set: paste it here and the button works on the next
      // click — no detour through /settings required.
      setState('need-token')
      return
    }
    setState('busy')
    const file = await ghLoadFile(BIB_PATH, token)
    if (!file.ok) {
      setState('error')
      setMsg(`读取 .bib 失败 (${file.status})`)
      return
    }
    if (bibHasArxivId(file.text, paper.id)) {
      setState('exists')
      return
    }
    const next = appendBibEntry(file.text, buildArxivBibEntry(paper))
    const r = await ghCommitFile(
      BIB_PATH,
      next,
      file.sha,
      `papers: add arXiv:${paper.id} to reading list`,
      token,
    )
    if (r.ok) {
      setState('done')
    } else {
      setState('error')
      setMsg(`提交失败 (${r.status}): ${r.message}`)
    }
  }

  if (state === 'done')
    return <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ 已提交，CI 生成待读条目（约 2 分钟）</span>
  if (state === 'exists') return <span className="text-xs text-neutral-400">已在待读库</span>

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={add}
        disabled={state === 'busy'}
        className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 transition hover:border-neutral-400 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {state === 'busy' ? '提交中…' : '＋ 加入待读'}
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
