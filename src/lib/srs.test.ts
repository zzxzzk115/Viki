import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  emptyStore,
  pickNext,
  schedule,
  stats,
  sweep,
  toDateKey,
  type CardState,
  type Store,
} from './srs'

const D = (s: string) => new Date(`${s}T12:00:00`)
const card = (id: string) => ({ id })

describe('schedule', () => {
  it('第一次答对 -> 1 天后', () => {
    const s = schedule(undefined, 5, D('2026-01-01'))
    assert.equal(s.interval, 1)
    assert.equal(s.reps, 1)
    assert.equal(s.due, '2026-01-02')
  })

  it('第二次答对 -> 6 天后', () => {
    const s1 = schedule(undefined, 5, D('2026-01-01'))
    const s2 = schedule(s1, 5, D('2026-01-02'))
    assert.equal(s2.interval, 6)
    assert.equal(s2.reps, 2)
    assert.equal(s2.due, '2026-01-08')
  })

  it('第三次起按 ease 倍增', () => {
    let s = schedule(undefined, 5, D('2026-01-01'))
    s = schedule(s, 5, D('2026-01-02'))
    const before = s.interval
    s = schedule(s, 5, D('2026-01-08'))
    // interval 6 * ease(~2.6) = ~16
    assert.equal(s.interval, Math.round(before * (s.ease - 0.1)))
    assert.ok(s.interval > 6, `期望间隔增长, 实际 ${s.interval}`)
  })

  it('答错 -> 间隔归 1, reps 归 0, lapses 加 1', () => {
    let s = schedule(undefined, 5, D('2026-01-01'))
    s = schedule(s, 5, D('2026-01-02'))
    s = schedule(s, 0, D('2026-01-08'))
    assert.equal(s.interval, 1)
    assert.equal(s.reps, 0)
    assert.equal(s.lapses, 1)
    assert.equal(s.due, '2026-01-09')
  })

  it('ease 不会低于 1.3 —— 连续答错也守住下限', () => {
    let s: CardState | undefined
    for (let i = 0; i < 30; i++) s = schedule(s, 0, D('2026-01-01'))
    assert.ok(s!.ease >= 1.3, `ease 跌破下限: ${s!.ease}`)
    assert.equal(s!.ease, 1.3)
  })

  it('答对提升 ease, 模糊降低 ease', () => {
    const easy = schedule(undefined, 5, D('2026-01-01'))
    const hard = schedule(undefined, 3, D('2026-01-01'))
    assert.ok(easy.ease > 2.5, `grade 5 应提升 ease, 实际 ${easy.ease}`)
    assert.ok(hard.ease < 2.5, `grade 3 应降低 ease, 实际 ${hard.ease}`)
  })

  it('grade 3 算通过，不计 lapse', () => {
    const s = schedule(undefined, 3, D('2026-01-01'))
    assert.equal(s.reps, 1)
    assert.equal(s.lapses, 0)
    assert.equal(s.interval, 1)
  })

  it('不修改传入的状态', () => {
    const s1 = schedule(undefined, 5, D('2026-01-01'))
    const snapshot = { ...s1 }
    schedule(s1, 0, D('2026-01-02'))
    assert.deepEqual(s1, snapshot)
  })

  it('三档评分产生真正不同的长期间隔', () => {
    // The reason for three buttons rather than a yes/no: the spread has to
    // actually separate, or the ease factor is decorative.
    const run = (grade: 0 | 3 | 5) => {
      let s: CardState | undefined
      let d = D('2026-01-01')
      for (let i = 0; i < 5; i++) {
        s = schedule(s, grade, d)
        d = new Date(d.getTime() + s.interval * 86400000)
      }
      return s!.interval
    }
    const [forgot, fuzzy, known] = [run(0), run(3), run(5)]
    assert.equal(forgot, 1)
    assert.ok(known > fuzzy, `记得(${known}) 应比模糊(${fuzzy}) 间隔长`)
    assert.ok(fuzzy > forgot, `模糊(${fuzzy}) 应比忘记(${forgot}) 间隔长`)
  })
})

describe('toDateKey', () => {
  it('用本地日期，不是 UTC —— 「今天到期」得是用户的今天', () => {
    assert.equal(toDateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
    assert.equal(toDateKey(new Date(2026, 0, 5, 0, 1)), '2026-01-05')
  })

  it('月份和日期补零', () => {
    assert.equal(toDateKey(new Date(2026, 2, 7)), '2026-03-07')
  })
})

describe('pickNext', () => {
  const cards = [card('a'), card('b'), card('c')]
  const always = () => 0

  it('空 store -> 新卡队列', () => {
    const p = pickNext(cards, emptyStore(), D('2026-01-01'), always)
    assert.equal(p.queue, 'new')
    assert.equal(p.newCount, 3)
    assert.ok(p.card)
  })

  it('到期卡优先于新卡', () => {
    const store: Store = {
      v: 1,
      cards: { b: { ease: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-01-01', last: '2025-12-31' } },
    }
    const p = pickNext(cards, store, D('2026-01-01'), always)
    assert.equal(p.queue, 'due')
    assert.equal(p.card?.id, 'b')
  })

  it('未到期的卡不出现，退回新卡', () => {
    const store: Store = {
      v: 1,
      cards: { b: { ease: 2.5, interval: 10, reps: 3, lapses: 0, due: '2026-06-01', last: '2026-01-01' } },
    }
    const p = pickNext(cards, store, D('2026-01-01'), always)
    assert.equal(p.queue, 'new')
    assert.notEqual(p.card?.id, 'b')
  })

  it('最早到期的先出', () => {
    const mk = (due: string): CardState => ({ ease: 2.5, interval: 1, reps: 1, lapses: 0, due, last: '2025-01-01' })
    const store: Store = { v: 1, cards: { a: mk('2026-01-05'), b: mk('2026-01-02'), c: mk('2026-01-09') } }
    const p = pickNext(cards, store, D('2026-01-10'), always)
    assert.equal(p.card?.id, 'b')
    assert.equal(p.dueCount, 3)
  })

  it('全部复习完 -> done', () => {
    const mk = (): CardState => ({ ease: 2.5, interval: 10, reps: 3, lapses: 0, due: '2026-12-01', last: '2026-01-01' })
    const store: Store = { v: 1, cards: { a: mk(), b: mk(), c: mk() } }
    const p = pickNext(cards, store, D('2026-01-01'), always)
    assert.equal(p.queue, 'done')
    assert.equal(p.card, null)
  })

  it('忽略已删除卡片的孤儿记录', () => {
    const store: Store = {
      v: 1,
      cards: { 已删除: { ease: 2.5, interval: 1, reps: 1, lapses: 0, due: '2020-01-01', last: '2020-01-01' } },
    }
    const p = pickNext(cards, store, D('2026-01-01'), always)
    assert.equal(p.queue, 'new', '孤儿记录不该被当成到期卡')
  })
})

describe('sweep', () => {
  it('清掉不存在的卡，保留存在的', () => {
    const s: CardState = { ease: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-01-01', last: '2026-01-01' }
    const store: Store = { v: 1, cards: { keep: s, gone: s } }
    const out = sweep(store, new Set(['keep']))
    assert.deepEqual(Object.keys(out.cards), ['keep'])
  })
})

describe('stats', () => {
  it('统计到期/已复习/新卡', () => {
    const store: Store = {
      v: 1,
      cards: {
        a: { ease: 2.5, interval: 1, reps: 1, lapses: 0, due: '2026-01-01', last: '2025-12-31' },
        b: { ease: 2.5, interval: 30, reps: 3, lapses: 0, due: '2026-06-01', last: '2026-01-01' },
      },
    }
    const s = stats([card('a'), card('b'), card('c')], store, D('2026-01-01'))
    assert.deepEqual(s, { total: 3, reviewed: 2, due: 1, fresh: 1 })
  })
})
