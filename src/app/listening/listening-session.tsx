'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { withBase } from '@/lib/base-path'
import { buildDictation, checkDictation, type Dictation } from '@/lib/listening'
import type { ListeningItem } from '@/lib/listening-feed'

/**
 * Dictation drill: play a human-recorded sentence, type the blanked words.
 * A run of N clips; each is graded per-blank, then the full sentence and its
 * Chinese translation are revealed. Audio plays via <audio> (Tatoeba mp3, no
 * CORS needed for media playback).
 */
const SIZE = 8

export function ListeningSession() {
  const [clips, setClips] = useState<ListeningItem[] | null>(null)
  const [error, setError] = useState(false)
  const [session, setSession] = useState<ListeningItem[] | null>(null)
  const [index, setIndex] = useState(0)
  const [inputs, setInputs] = useState<string[]>([])
  const [revealed, setRevealed] = useState(false)
  const [score, setScore] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let alive = true
    fetch(withBase('/data/listening.json'))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((f: { items?: ListeningItem[] }) => alive && setClips(f.items ?? []))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [])

  const current = session?.[index] ?? null
  const dict: Dictation | null = useMemo(
    () => (current ? buildDictation(current.text) : null),
    [current],
  )

  // Autoplay each clip when it appears (best-effort; a manual replay button too).
  useEffect(() => {
    if (current) void audioRef.current?.play().catch(() => {})
  }, [current])

  const start = () => {
    if (!clips || clips.length === 0) return
    const shuffled = [...clips].sort(() => Math.random() - 0.5).slice(0, SIZE)
    setSession(shuffled)
    setIndex(0)
    setInputs([])
    setRevealed(false)
    setScore(0)
  }

  const submit = () => {
    if (!dict || revealed) return
    const marks = checkDictation(inputs, dict.answers)
    if (marks.every(Boolean)) setScore((s) => s + 1)
    setRevealed(true)
  }

  const next = () => {
    setIndex((i) => i + 1)
    setInputs([])
    setRevealed(false)
  }

  if (error) return <p className="mt-6 text-sm text-red-600 dark:text-red-400">听力数据加载失败。</p>
  if (!clips) return <div className="mt-6 min-h-64 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900" />
  if (clips.length === 0) {
    return (
      <p className="mt-6 rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
        还没有听力数据。定时任务每天抓取;本地可 <code className="text-xs">pnpm data:pull</code>。
      </p>
    )
  }

  if (!session) {
    return (
      <div className="mt-6 rounded-xl border border-neutral-200 p-8 text-center dark:border-neutral-800">
        <p className="text-lg font-medium">听写闯关</p>
        <p className="mt-2 text-sm text-neutral-500">{Math.min(SIZE, clips.length)} 句 · 听音频,填出关键词</p>
        <button
          type="button"
          onClick={start}
          className="mt-5 rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          开始
        </button>
      </div>
    )
  }

  if (index >= session.length) {
    const pct = Math.round((score / session.length) * 100)
    return (
      <div className="mt-6 rounded-xl border border-neutral-200 p-8 text-center dark:border-neutral-800">
        <p className="text-3xl font-bold tabular-nums">{pct}%</p>
        <p className="mt-1 text-sm text-neutral-500">
          {score} / {session.length} 全对 · {pct >= 80 ? '过关 🎉' : '再来一轮'}
        </p>
        <button
          type="button"
          onClick={start}
          className="mt-5 rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          再来一轮
        </button>
      </div>
    )
  }

  const marks = revealed && dict ? checkDictation(inputs, dict.answers) : []
  let blankNo = -1

  return (
    <div className="mt-6 rounded-xl border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-2.5 text-xs text-neutral-500 dark:border-neutral-800">
        <span className="tabular-nums">{index + 1} / {session.length}</span>
        <span className="ml-auto">听并填空</span>
      </div>

      <div className="p-6">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio ref={audioRef} src={current!.audio} preload="auto" />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void audioRef.current?.play().catch(() => {})}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            🔊 播放
          </button>
          <span className="text-xs text-neutral-400">听不清可多放几遍</span>
        </div>

        <form
          className="mt-5 text-lg leading-relaxed"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {dict!.tokens.map((t, i) => {
            if (!t.blank) return <span key={i}>{t.raw} </span>
            blankNo++
            const bi = blankNo
            const mark = revealed ? marks[bi] : null
            return (
              <span key={i} className="inline-block">
                <input
                  type="text"
                  value={inputs[bi] ?? ''}
                  onChange={(e) => setInputs((prev) => { const n = [...prev]; n[bi] = e.target.value; return n })}
                  disabled={revealed}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  size={Math.max(6, t.raw.length)}
                  className={`mx-0.5 border-b-2 bg-transparent px-1 text-center outline-none ${
                    revealed
                      ? mark
                        ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                        : 'border-red-400 text-red-600 dark:text-red-400'
                      : 'border-sky-400 focus:border-sky-600'
                  }`}
                />{' '}
              </span>
            )
          })}
        </form>

        {revealed && (
          <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
            <p className="font-medium">{current!.text}</p>
            {current!.translation && <p className="mt-1 text-neutral-500">{current!.translation}</p>}
          </div>
        )}

        <button
          type="button"
          onClick={revealed ? next : submit}
          disabled={!revealed && inputs.filter((s) => s?.trim()).length === 0}
          className="mt-5 w-full rounded-lg border border-neutral-300 py-2.5 text-sm font-medium transition hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {revealed ? (index + 1 >= session.length ? '看结果' : '下一句 →') : '对答案'}
        </button>
      </div>
    </div>
  )
}
