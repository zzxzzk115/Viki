import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { QuizStats } from './quiz-store'
import type { CardState, Store } from './srs'
import { mergeQuiz, mergeSrs, parseSyncDoc } from './srs-sync'

const cs = (last: string, reps = 1): CardState => ({
  ease: 2.5,
  interval: 1,
  reps,
  lapses: 0,
  due: '2026-07-20',
  last,
})

const store = (cards: Record<string, CardState>): Store => ({ v: 1, cards })

const quiz = (total: number): QuizStats => ({
  v: 1,
  total,
  correct: Math.floor(total / 2),
  bySubject: {},
  streak: { current: 1, best: 1, lastDay: '2026-07-16' },
})

describe('mergeSrs', () => {
  it('后复习的一方赢（按 last 日期）', () => {
    const merged = mergeSrs(store({ a: cs('2026-07-16') }), store({ a: cs('2026-07-10') }))
    assert.equal(merged.cards.a.last, '2026-07-16')
    const merged2 = mergeSrs(store({ a: cs('2026-07-10') }), store({ a: cs('2026-07-16') }))
    assert.equal(merged2.cards.a.last, '2026-07-16')
  })

  it('同日平手时 reps 多的赢（更多历史）', () => {
    const merged = mergeSrs(store({ a: cs('2026-07-16', 2) }), store({ a: cs('2026-07-16', 5) }))
    assert.equal(merged.cards.a.reps, 5)
  })

  it('两端各自复习过的卡都保留（并集）', () => {
    const merged = mergeSrs(store({ a: cs('2026-07-16') }), store({ b: cs('2026-07-15') }))
    assert.deepEqual(Object.keys(merged.cards).sort(), ['a', 'b'])
  })

  it('空的一端不吃掉另一端', () => {
    const remote = store({ a: cs('2026-07-16') })
    assert.deepEqual(mergeSrs(store({}), remote), remote)
  })
})

describe('mergeQuiz', () => {
  it('答题总数多的整体获胜（聚合计数没法真合并）', () => {
    assert.equal(mergeQuiz(quiz(10), quiz(30)).total, 30)
    assert.equal(mergeQuiz(quiz(30), quiz(10)).total, 30)
  })
})

describe('parseSyncDoc', () => {
  it('合法文档解析成功', () => {
    const doc = { v: 1, savedAt: 'x', srs: store({}), quiz: quiz(0) }
    assert.ok(parseSyncDoc(JSON.stringify(doc)))
  })

  it('版本不符 / 缺字段 / 非 JSON -> null（宁可不合并，不能吃坏数据）', () => {
    assert.equal(parseSyncDoc('{"v":2}'), null)
    assert.equal(parseSyncDoc('{"v":1,"srs":{"v":1,"cards":{}}}'), null)
    assert.equal(parseSyncDoc('not json'), null)
  })
})
