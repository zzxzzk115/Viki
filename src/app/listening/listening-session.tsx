'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { withBase } from '@/lib/base-path'
import { buildDictation, checkDictation, type Dictation } from '@/lib/listening'
import type { ListeningItem } from '@/lib/listening-feed'
import {
  accuracy,
  bumpSession,
  emptyProgress,
  type ListeningProgress,
  pickSession,
  recordResult,
} from '@/lib/listening-progress'

/**
 * Dictation drill on real VOA Learning English broadcasts: play the newsreader
 * audio, type the blanked words in the opening lines, then reveal the transcript
 * and the source story. Progress (lifetime stats + which clips are done) is kept
 * in localStorage so a run is never lost and fresh clips surface first. Audio
 * plays via <audio> (no CORS needed for media playback).
 */
const SIZE = 8
const STORE = 'viki:listening:v1'

/** Scale blanks to excerpt length — a longer clip earns more gaps. */
function blanksFor(text: string): number {
  const w = text.split(/\s+/).length
  return Math.min(6, Math.max(3, Math.round(w / 7)))
}

export function ListeningSession() {
  const [clips, setClips] = useState<ListeningItem[] | null>(null)
  const [error, setError] = useState(false)
  const [progress, setProgress] = useState<ListeningProgress>(emptyProgress)
  const [session, setSession] = useState<ListeningItem[] | null>(null)
  const [index, setIndex] = useState(0)
  const [inputs, setInputs] = useState<string[]>([])
  const [revealed, setRevealed] = useState(false)
  const [score, setScore] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let alive = true
    fetch(withBase('/data/listening.json'))
      // A missing file (feed not fetched yet) is the empty state, not an error;
      // only a real network failure sets error.
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((f: { items?: ListeningItem[] }) => alive && setClips(f.items ?? []))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [])

  // Load saved progress once.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE)
      if (raw) setProgress({ ...emptyProgress(), ...JSON.parse(raw) })
    } catch {}
  }, [])

  const persist = (p: ListeningProgress) => {
    setProgress(p)
    try {
      localStorage.setItem(STORE, JSON.stringify(p))
    } catch {}
  }

  const current = session?.[index] ?? null
  const dict: Dictation | null = useMemo(
    () => (current ? buildDictation(current.text, Math.random, blanksFor(current.text)) : null),
    [current],
  )

  // Autoplay each clip when it appears (best-effort; a manual replay button too).
  useEffect(() => {
    if (current) void audioRef.current?.play().catch(() => {})
  }, [current])

  const start = () => {
    if (!clips || clips.length === 0) return
    setSession(pickSession(clips, progress, SIZE))
    setIndex(0)
    setInputs([])
    setRevealed(false)
    setScore(0)
  }

  const submit = () => {
    if (!dict || revealed || !current) return
    const marks = checkDictation(inputs, dict.answers)
    const allRight = marks.every(Boolean)
    if (allRight) setScore((s) => s + 1)
    persist(recordResult(progress, current.id, allRight))
    setRevealed(true)
  }

  const next = () => {
    const to = index + 1
    if (session && to >= session.length) persist(bumpSession(progress))
    setIndex(to)
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

  const stats = (
    <p className="mt-2 text-xs text-neutral-400">
      累计 <span className="tabular-nums">{progress.attempted}</span> 句 · 正确率{' '}
      <span className="tabular-nums">{accuracy(progress)}%</span> · 完成{' '}
      <span className="tabular-nums">{progress.sessions}</span> 轮
    </p>
  )

  if (!session) {
    const fresh = clips.filter((c) => !progress.done[c.id]).length
    return (
      <div className="mt-6 rounded-xl border border-neutral-200 p-8 text-center dark:border-neutral-800">
        <p className="text-lg font-medium">听写闯关</p>
        <p className="mt-2 text-sm text-neutral-500">
          {Math.min(SIZE, clips.length)} 段 VOA 真实广播 · 听音频,填出关键词
        </p>
        {progress.attempted > 0 && stats}
        <p className="mt-1 text-xs text-neutral-400">{fresh} 段还没听过</p>
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
        {stats}
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
        {current!.source && <span className="truncate">· {current!.source}</span>}
        <span className="ml-auto">听开头,填空</span>
      </div>

      <div className="p-6">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio ref={audioRef} src={current!.audio} preload="none" />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void audioRef.current?.play().catch(() => {})}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            🔊 播放
          </button>
          <button
            type="button"
            onClick={() => {
              const a = audioRef.current
              if (a) {
                a.currentTime = 0
                void a.play().catch(() => {})
              }
            }}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm transition hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            ↻ 从头
          </button>
          <span className="text-xs text-neutral-400">播报先念标题,再念正文——填的是开头这句</span>
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
            {(current!.title || current!.url) && (
              <p className="mt-2 text-xs text-neutral-400">
                {current!.title && <span>{current!.title}</span>}
                {current!.url && (
                  <>
                    {current!.title ? ' · ' : ''}
                    <a
                      href={current!.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-dotted underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-300"
                    >
                      阅读原文
                    </a>
                  </>
                )}
              </p>
            )}
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
