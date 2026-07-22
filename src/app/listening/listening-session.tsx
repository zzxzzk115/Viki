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
 * Dictation on real VOA Learning English broadcasts, cut into short segments.
 * Each clip is a ~20–30s slice of a news/feature story: the player seeks to the
 * segment's window inside the article mp3 and auto-pauses at its end, so you hear
 * just that piece — not the whole article. Speed is adjustable (VOA reads slowly;
 * 1.25× is closer to natural). Fill the blanked words, then reveal and read along.
 * Progress persists in localStorage so a run is never lost and fresh clips come
 * first. Audio plays via <audio> (no CORS needed).
 */
const SIZE = 6 // segments per run
const PASS = 0.7 // blank-accuracy to "pass" a segment
const STORE = 'viki:listening:v1'
const SPEEDS = [0.75, 1, 1.25, 1.5]
const END_PAD = 0.25 // seconds of grace so the last word is never clipped

/** ~1 blank per 7 words. */
function blanksFor(text: string): number {
  return Math.min(10, Math.max(5, Math.round(text.split(/\s+/).length / 7)))
}

interface RunStat {
  passed: number
  right: number
  total: number
}

export function ListeningSession() {
  const [clips, setClips] = useState<ListeningItem[] | null>(null)
  const [error, setError] = useState(false)
  const [progress, setProgress] = useState<ListeningProgress>(emptyProgress)
  const [session, setSession] = useState<ListeningItem[] | null>(null)
  const [index, setIndex] = useState(0)
  const [inputs, setInputs] = useState<string[]>([])
  const [revealed, setRevealed] = useState(false)
  const [run, setRun] = useState<RunStat>({ passed: 0, right: 0, total: 0 })
  const [rate, setRate] = useState(1.25)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rateRef = useRef(1.25)
  const winRef = useRef({ start: 0, end: 1 })

  useEffect(() => {
    let alive = true
    fetch(withBase('/data/listening.json'))
      // A missing file (feed not fetched yet) is the empty state, not an error.
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((f: { items?: ListeningItem[] }) => alive && setClips(f.items ?? []))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [])

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

  // Keep the play window in a ref so the audio event handlers never go stale.
  useEffect(() => {
    if (current) winRef.current = { start: current.startFrac, end: current.endFrac }
  }, [current])

  const playSeg = () => {
    const a = audioRef.current
    if (!a) return
    a.playbackRate = rateRef.current
    const go = () => {
      if (isFinite(a.duration)) a.currentTime = a.duration * winRef.current.start
      void a.play().catch(() => {})
    }
    if (a.readyState >= 1 && isFinite(a.duration)) go()
    else {
      a.addEventListener('loadedmetadata', go, { once: true })
      a.load()
    }
  }

  // Auto-pause when playback reaches the segment's end.
  const onTimeUpdate = () => {
    const a = audioRef.current
    if (!a || !isFinite(a.duration)) return
    if (a.currentTime >= a.duration * winRef.current.end + END_PAD) a.pause()
  }

  // Play the new segment from its start (best-effort; a Play button too).
  useEffect(() => {
    if (current) playSeg()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  const setSpeed = (s: number) => {
    setRate(s)
    rateRef.current = s
    if (audioRef.current) audioRef.current.playbackRate = s
  }

  const start = () => {
    if (!clips || clips.length === 0) return
    setSession(pickSession(clips, progress, SIZE))
    setIndex(0)
    setInputs([])
    setRevealed(false)
    setRun({ passed: 0, right: 0, total: 0 })
  }

  const submit = () => {
    if (!dict || revealed || !current) return
    const marks = checkDictation(inputs, dict.answers)
    const right = marks.filter(Boolean).length
    const total = marks.length
    const passed = total > 0 && right / total >= PASS
    setRun((r) => ({ passed: r.passed + (passed ? 1 : 0), right: r.right + right, total: r.total + total }))
    persist(recordResult(progress, current.id, passed))
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
      累计 <span className="tabular-nums">{progress.attempted}</span> 段 · 正确率{' '}
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
          {Math.min(SIZE, clips.length)} 段 VOA 真实广播 · 每段只播一小节,填出关键词
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
    const pct = run.total ? Math.round((run.right / run.total) * 100) : 0
    return (
      <div className="mt-6 rounded-xl border border-neutral-200 p-8 text-center dark:border-neutral-800">
        <p className="text-3xl font-bold tabular-nums">{pct}%</p>
        <p className="mt-1 text-sm text-neutral-500">
          {run.right} / {run.total} 空格正确 · 过关 {run.passed}/{session.length} 段 ·{' '}
          {pct >= 80 ? '很棒 🎉' : '再来一轮'}
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
  const filled = inputs.filter((s) => s?.trim()).length
  let blankNo = -1

  return (
    <div className="mt-6 rounded-xl border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-2.5 text-xs text-neutral-500 dark:border-neutral-800">
        <span className="tabular-nums">{index + 1} / {session.length}</span>
        {current!.source && <span className="truncate">· {current!.source}</span>}
        <span className="ml-auto tabular-nums">{filled}/{dict!.answers.length} 已填</span>
      </div>

      <div className="p-6">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio ref={audioRef} src={current!.audio} preload="none" onTimeUpdate={onTimeUpdate} />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={playSeg}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            🔊 播放本段
          </button>
          {/* Speed control — VOA reads slowly, so default to 1.25×. */}
          <div className="inline-flex overflow-hidden rounded-lg border border-neutral-300 text-xs dark:border-neutral-700">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={`px-2.5 py-2 tabular-nums transition ${
                  rate === s
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
          <span className="w-full text-xs text-neutral-400 sm:w-auto">只播当前小段,可反复听、调速</span>
        </div>

        <form
          className="mt-5 rounded-lg bg-neutral-50 p-4 text-[15px] leading-8 dark:bg-neutral-900/60"
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
          <div className="mt-4 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            <p className="text-xs font-medium text-neutral-500">{marks.filter(Boolean).length}/{marks.length} 空格正确</p>
            <p className="mt-1.5 leading-relaxed text-neutral-700 dark:text-neutral-300">{current!.text}</p>
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
          disabled={!revealed && filled === 0}
          className="mt-5 w-full rounded-lg border border-neutral-300 py-2.5 text-sm font-medium transition hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {revealed ? (index + 1 >= session.length ? '看结果' : '下一段 →') : '对答案'}
        </button>
      </div>
    </div>
  )
}
