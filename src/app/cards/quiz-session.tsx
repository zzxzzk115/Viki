'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { withBase } from '@/lib/base-path'
import { buildSession, checkCloze, gradeFor, type QuizQuestion } from '@/lib/quiz'
import { recordAnswer, useQuizStats } from '@/lib/quiz-store'
import type { Card, Glossary } from '@/lib/schema'
import { pickNext, schedule, stats, sweep, toDateKey } from '@/lib/srs'
import { useHydrated, useSrsStore } from '@/lib/store'

const SESSION_SIZE = 10

interface Answered {
  q: QuizQuestion
  correct: boolean
}

/**
 * 刷题 mode: a 10-question run of choice/cloze questions built from the card
 * pool (due first, then new). Choice options are the card's own :::quiz
 * block (authored, short, shown in full — never harvested from other cards);
 * cloze blanks a glossary term or a **bold** keyword. Every answer writes
 * through to the SM-2 store with the agreed mapping (choice-correct=3,
 * cloze-correct=5, wrong=0), so drilling advances the review schedule instead
 * of living beside it; accuracy and the day-streak go to the quiz store.
 */
export function QuizSession({ subject }: { subject?: string }) {
  const hydrated = useHydrated()
  const { store, save } = useSrsStore()
  const { quizStats, saveQuizStats } = useQuizStats()

  const [cards, setCards] = useState<Card[] | null>(null)
  const [glossary, setGlossary] = useState<Glossary | null>(null)
  const [error, setError] = useState(false)

  const [session, setSession] = useState<QuizQuestion[] | null>(null)
  const [index, setIndex] = useState(0)
  const [answered, setAnswered] = useState<Answered[]>([])
  /** For the current question: chosen option index / cloze verdict. */
  const [choice, setChoice] = useState<number | null>(null)
  const [clozeInput, setClozeInput] = useState('')
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch(withBase('/data/cards.json')).then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch(withBase('/data/glossary.json')).then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([c, g]: [Card[], Glossary]) => {
        if (!alive) return
        setCards(c)
        setGlossary(g)
      })
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [])

  const pool = useMemo(
    () => (cards ?? []).filter((c) => !subject || c.subject === subject),
    [cards, subject],
  )

  const start = useCallback(() => {
    if (!glossary || pool.length === 0) return
    const today = toDateKey(new Date())
    const dueIds = new Set(
      pool.filter((c) => store.cards[c.id] && store.cards[c.id].due <= today).map((c) => c.id),
    )
    const newIds = new Set(pool.filter((c) => !store.cards[c.id]).map((c) => c.id))
    setSession(buildSession(pool, dueIds, newIds, glossary, SESSION_SIZE))
    setIndex(0)
    setAnswered([])
    setChoice(null)
    setClozeInput('')
    setRevealed(false)
    // store is intentionally read once at session start — mid-session grading
    // must not rebuild the running session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glossary, pool])

  const current = session?.[index] ?? null

  const submit = useCallback(
    (correct: boolean) => {
      if (!current || revealed) return
      setRevealed(true)
      setAnswered((a) => [...a, { q: current, correct }])

      // SM-2 write-through — same sweep+save path as the flashcard flow.
      const grade = gradeFor(current.mode, correct)
      const liveIds = new Set((cards ?? []).map((c) => c.id))
      const swept = sweep(store, liveIds)
      save({
        ...swept,
        cards: {
          ...swept.cards,
          [current.card.id]: schedule(store.cards[current.card.id], grade, new Date()),
        },
      })
      saveQuizStats(recordAnswer(quizStats, current.card.subject, correct))
    },
    [current, revealed, cards, store, save, quizStats, saveQuizStats],
  )

  const next = () => {
    setIndex((i) => i + 1)
    setChoice(null)
    setClozeInput('')
    setRevealed(false)
  }

  if (!hydrated || (!cards && !error)) {
    return <div className="min-h-64 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900" />
  }
  if (error) return <p className="text-sm text-red-600 dark:text-red-400">数据加载失败。</p>
  if (pool.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
        这个范围还没有卡片——先去写点卡片吧。
      </p>
    )
  }

  // Not started yet.
  if (!session) {
    const s = stats(pool, store)
    return (
      <div className="rounded-xl border border-neutral-200 p-8 text-center dark:border-neutral-800">
        <p className="text-lg font-medium">刷题闯关</p>
        <p className="mt-2 text-sm text-neutral-500">
          最多 {Math.min(SESSION_SIZE, pool.length)} 题 · 到期优先 · 选择答对计「模糊」、关键词填空答对计「记得」，直接推进记忆计划
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          待复习 {s.due} · 新卡 {s.fresh} · 连续刷题 {quizStats.streak.current} 天
        </p>
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

  // Built nothing: no card in range has authored options or blankable keywords.
  if (session.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
        这个范围的卡片都还没法出题——给卡片加 :::quiz 选项，或在答案里用 :term
        术语 / **加粗** 标出关键词。翻卡模式不受影响。
      </p>
    )
  }

  // Session finished.
  if (index >= session.length) {
    const correct = answered.filter((a) => a.correct).length
    const pct = session.length ? Math.round((correct / session.length) * 100) : 0
    return (
      <div className="rounded-xl border border-neutral-200 p-8 text-center dark:border-neutral-800">
        <p className="text-3xl font-bold tabular-nums">{pct}%</p>
        <p className="mt-1 text-sm text-neutral-500">
          {correct} / {session.length} 正确 · {pct >= 80 ? '过关 🎉' : '未达 80%，再来一轮'}
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          全部 {session.length} 题已计入记忆计划 · 连续刷题 {quizStats.streak.current} 天（最佳 {quizStats.streak.best}）
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

  const q = current!
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-2.5 text-xs text-neutral-500 dark:border-neutral-800">
        <span className="tabular-nums">
          {index + 1} / {session.length}
        </span>
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
          {q.mode === 'choice' ? '选择' : '填空'}
        </span>
        <span className="ml-auto tabular-nums">
          ✓ {answered.filter((a) => a.correct).length} · ✗ {answered.filter((a) => !a.correct).length}
        </span>
      </div>

      <div className="p-6">
        <div
          className="prose prose-neutral dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: q.card.questionHtml }}
        />

        {q.mode === 'choice' ? (
          <div className="mt-5 space-y-2">
            {q.options.map((opt, i) => {
              const isPicked = choice === i
              const isRight = i === q.correctIndex
              const cls = !revealed
                ? 'border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800'
                : isRight
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950'
                  : isPicked
                    ? 'border-red-400 bg-red-50 dark:bg-red-950'
                    : 'border-neutral-200 opacity-50 dark:border-neutral-800'
              return (
                <button
                  key={i}
                  type="button"
                  disabled={revealed}
                  onClick={() => {
                    setChoice(i)
                    submit(i === q.correctIndex)
                  }}
                  className={`block w-full rounded-lg border px-4 py-2.5 text-left text-sm transition ${cls}`}
                >
                  {/* Authored options are short statements — always shown in full. */}
                  <span dangerouslySetInnerHTML={{ __html: opt }} />
                </button>
              )
            })}
          </div>
        ) : (
          <>
            <div
              className="prose prose-neutral dark:prose-invert mt-5 max-w-none"
              dangerouslySetInnerHTML={{ __html: q.blankedHtml }}
            />
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!revealed) submit(checkCloze(clozeInput, q.accepted))
              }}
            >
              <input
                type="text"
                value={clozeInput}
                onChange={(e) => setClozeInput(e.target.value)}
                disabled={revealed}
                placeholder="填入被挖掉的关键词（术语可用中文/英文/缩写）"
                className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:opacity-60 dark:border-neutral-700"
              />
              <button
                type="submit"
                disabled={revealed || !clozeInput.trim()}
                className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
              >
                提交
              </button>
            </form>
            {revealed && (
              <p
                className={`mt-3 text-sm ${answered[answered.length - 1]?.correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
              >
                {answered[answered.length - 1]?.correct ? '✓ 正确' : '✗ 不对'}
                ——答案是「{q.term}」
              </p>
            )}
          </>
        )}

        {revealed && (
          <button
            type="button"
            onClick={next}
            className="mt-5 w-full rounded-lg border border-neutral-300 py-2.5 text-sm font-medium transition hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {index + 1 >= session.length ? '看结果' : '下一题 →'}
          </button>
        )}
      </div>
    </div>
  )
}
