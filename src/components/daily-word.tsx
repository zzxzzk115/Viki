'use client'

import { useEffect, useState } from 'react'
import { AddToVocab } from '@/components/add-to-vocab'
import { PlayWord } from '@/components/play-word'
import { withBase } from '@/lib/base-path'

export interface DailyWordData {
  date: string
  word: string
  /** UK IPA. */
  ipa: string
  /** US IPA (Cambridge source). */
  ipaUs?: string
  pos: string
  definition: string
  /** Chinese gloss of the definition (may be '' on translation failure). */
  definitionZh?: string
  example: string
  /** Chinese gloss of the example. */
  exampleZh?: string
  /** Real UK/US pronunciation mp3s from the dictionary API, when available. */
  audioUk?: string
  audioUs?: string
}

/**
 * 「每日单词」— today's word from data/vocab/daily.json (written by the
 * reading.yml cron). Definition is English (E-E); 「加入单词本」 commits it as a
 * ::::word so it enters the vocabulary review track.
 */
export function DailyWord() {
  const [w, setW] = useState<DailyWordData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    fetch(withBase('/data/daily-word.json'))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: DailyWordData) => {
        if (!alive) return
        setW(d?.word ? d : null)
        setState('ready')
      })
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
    }
  }, [])

  if (state === 'loading') {
    return <div className="min-h-28 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900" />
  }
  if (!w) return null

  return (
    <div className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <span className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">每日单词</span>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl font-bold tracking-tight">{w.word}</span>
        {w.ipa && <span className="text-sm text-neutral-400">英 /{w.ipa}/</span>}
        {w.ipaUs && <span className="text-sm text-neutral-400">美 /{w.ipaUs}/</span>}
        {w.pos && <span className="text-xs text-neutral-400">{w.pos}.</span>}
        <PlayWord word={w.word} audioUk={w.audioUk} audioUs={w.audioUs} />
      </div>
      {w.definitionZh && <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-200">{w.definitionZh}</p>}
      {w.definition && <p className="mt-0.5 text-xs text-neutral-500">{w.definition}</p>}
      {w.example && (
        <p className="mt-2 text-sm text-neutral-500 italic">
          “{w.example}”
          {w.exampleZh && <span className="mt-0.5 block text-xs text-neutral-400 not-italic">{w.exampleZh}</span>}
        </p>
      )}
      <div className="mt-3">
        <AddToVocab word={w} />
      </div>
    </div>
  )
}
