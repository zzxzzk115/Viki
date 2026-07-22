'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { withBase } from '@/lib/base-path'
import type { Word } from '@/lib/schema'
import { GRADES, pickNext, schedule, stats, sweep, type Grade } from '@/lib/srs'
import { useHydrated } from '@/lib/store'
import { buildSpellQuestion, checkSpelling, gradeSpell } from '@/lib/vocab-quiz'
import { useVocabStore } from '@/lib/vocab-store'

type Mode = 'flip' | 'spell'

/**
 * Vocabulary review — the word track's answer to /cards, but on its own store
 * (viki:vocab:v1) and its own quiz (recall the word from its meaning). Reuses
 * the SM-2 engine (pickNext/schedule/stats/sweep) verbatim.
 */
export function EnglishSession() {
  const hydrated = useHydrated()
  const { store, save } = useVocabStore()
  const [words, setWords] = useState<Word[] | null>(null)
  const [error, setError] = useState(false)
  const [mode, setMode] = useState<Mode>('flip')
  const [revealed, setRevealed] = useState(false)
  const [extra, setExtra] = useState(0)
  const [input, setInput] = useState('')

  useEffect(() => {
    let alive = true
    fetch(withBase('/data/vocab.json'))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((w: Word[]) => alive && setWords(w))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [])

  const pick = useMemo(
    () => pickNext(words ?? [], store, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words, store, extra],
  )
  const s = useMemo(() => stats(words ?? [], store), [words, store])

  const grade = useCallback(
    (g: Grade) => {
      if (!pick.card || !words) return
      const swept = sweep(store, new Set(words.map((w) => w.id)))
      save({
        ...swept,
        cards: { ...swept.cards, [pick.card.id]: schedule(store.cards[pick.card.id], g, new Date()) },
      })
      setRevealed(false)
      setInput('')
      setExtra((n) => n + 1)
    },
    [pick.card, store, save, words],
  )

  if (!hydrated || (!words && !error)) {
    return <div className="mt-6 min-h-64 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900" />
  }
  if (error) return <p className="mt-6 text-sm text-red-600 dark:text-red-400">单词加载失败。</p>
  if (!words || words.length === 0) {
    return (
      <p className="mt-6 rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
        还没有单词。在 <code className="text-xs">content/english/</code> 里用 <code className="text-xs">::::word</code> 写就会出现在这里。
      </p>
    )
  }

  const w = pick.card
  const answered = revealed && mode === 'spell' ? checkSpelling(input, buildSpellQuestion(w!).accepted) : null

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-neutral-300 text-sm dark:border-neutral-700">
          {(
            [
              ['flip', '记单词'],
              ['spell', '拼写'],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                setRevealed(false)
                setInput('')
              }}
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
        <span className="ml-auto text-xs text-neutral-400">
          共 {s.total} · 到期 {s.due} · 新词 {s.fresh}
        </span>
      </div>

      <div className="mt-4">
        {!w ? (
          <div className="rounded-xl border border-neutral-200 p-8 text-center dark:border-neutral-800">
            <p className="text-lg">今天背完了 🎉</p>
            <p className="mt-1 text-sm text-neutral-500">共 {s.total} 词 · 已学 {s.reviewed} 词</p>
            <button
              type="button"
              onClick={() => setExtra((n) => n + 1)}
              className="mt-4 text-sm text-neutral-500 underline hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              随机再来一个
            </button>
          </div>
        ) : mode === 'flip' ? (
          <FlipCard word={w} queue={pick.queue} dueCount={pick.dueCount} revealed={revealed} onReveal={() => setRevealed(true)} onGrade={grade} />
        ) : (
          <SpellCard
            word={w}
            queue={pick.queue}
            dueCount={pick.dueCount}
            revealed={revealed}
            correct={answered}
            input={input}
            setInput={setInput}
            onSubmit={() => setRevealed(true)}
            onGrade={(ok) => grade(gradeSpell(ok))}
          />
        )}
      </div>
    </>
  )
}

function Header({ queue, dueCount, word }: { queue: string; dueCount: number; word: Word }) {
  return (
    <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-2.5 text-xs text-neutral-500 dark:border-neutral-800">
      <span className={queue === 'due' ? 'font-medium text-amber-600 dark:text-amber-400' : 'font-medium text-sky-600 dark:text-sky-400'}>
        {queue === 'due' ? `待复习 ${dueCount}` : '新词'}
      </span>
      {word.pos && <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">{word.pos}.</span>}
      <Link href={`${word.noteHref}`} className="ml-auto hover:text-neutral-700 dark:hover:text-neutral-200">
        出自：{word.noteTitle} →
      </Link>
    </div>
  )
}

function FlipCard({
  word,
  queue,
  dueCount,
  revealed,
  onReveal,
  onGrade,
}: {
  word: Word
  queue: string
  dueCount: number
  revealed: boolean
  onReveal: () => void
  onGrade: (g: Grade) => void
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800">
      <Header queue={queue} dueCount={dueCount} word={word} />
      <div className="p-6 text-center">
        <p className="text-3xl font-bold tracking-tight">{word.word}</p>
        {word.ipa && <p className="mt-1 text-sm text-neutral-400">{word.ipa}</p>}
        {revealed ? (
          <>
            <hr className="my-5 border-neutral-200 dark:border-neutral-800" />
            <div className="prose prose-neutral dark:prose-invert mx-auto max-w-none text-left" dangerouslySetInnerHTML={{ __html: word.meaningHtml }} />
            {word.exampleHtml && (
              <div className="prose prose-neutral dark:prose-invert mx-auto mt-2 max-w-none text-left text-sm text-neutral-500" dangerouslySetInnerHTML={{ __html: word.exampleHtml }} />
            )}
            <div className="mt-6 grid grid-cols-3 gap-2">
              {GRADES.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => onGrade(g.value)}
                  title={g.hint}
                  className="rounded-lg border border-neutral-200 py-2.5 text-sm font-medium transition hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
                >
                  {g.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={onReveal}
            className="mt-6 w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            显示释义
          </button>
        )}
      </div>
    </div>
  )
}

function SpellCard({
  word,
  queue,
  dueCount,
  revealed,
  correct,
  input,
  setInput,
  onSubmit,
  onGrade,
}: {
  word: Word
  queue: string
  dueCount: number
  revealed: boolean
  correct: boolean | null
  input: string
  setInput: (v: string) => void
  onSubmit: () => void
  onGrade: (ok: boolean) => void
}) {
  const q = buildSpellQuestion(word)
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800">
      <Header queue={queue} dueCount={dueCount} word={word} />
      <div className="p-6">
        <p className="mb-3 text-xs tracking-wide text-neutral-400 uppercase">拼出这个单词</p>
        <div className="prose prose-neutral dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: word.meaningHtml }} />
        {q.blankedExampleHtml && (
          <div className="prose prose-neutral dark:prose-invert mt-2 max-w-none text-sm text-neutral-500" dangerouslySetInnerHTML={{ __html: q.blankedExampleHtml }} />
        )}
        {!revealed ? (
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (input.trim()) onSubmit()
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="输入单词"
              className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
            >
              提交
            </button>
          </form>
        ) : (
          <div className="mt-4">
            <p className={`text-sm ${correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {correct ? '✓ 拼对了' : '✗ 不对'} —— 正确拼写：<strong>{word.word}</strong>
            </p>
            <button
              type="button"
              onClick={() => onGrade(!!correct)}
              className="mt-4 w-full rounded-lg border border-neutral-300 py-2.5 text-sm font-medium transition hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              下一个 →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
