import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ListeningItem } from './listening-feed'
import { accuracy, bumpSession, emptyProgress, pickSession, recordResult } from './listening-progress'

const clip = (id: string): ListeningItem => ({ id, text: 't', audio: 'a', startFrac: 0, endFrac: 1, translation: '', title: '', source: '', url: '' })

describe('recordResult', () => {
  it('累计 attempted/correct，记录每条结果', () => {
    let p = emptyProgress()
    p = recordResult(p, 'a', true)
    p = recordResult(p, 'b', false)
    assert.equal(p.attempted, 2)
    assert.equal(p.correct, 1)
    assert.deepEqual(p.done, { a: { correct: true }, b: { correct: false } })
  })

  it('重做同一条会覆盖结果但仍计入 attempted', () => {
    let p = recordResult(emptyProgress(), 'a', false)
    p = recordResult(p, 'a', true)
    assert.equal(p.attempted, 2)
    assert.equal(p.correct, 1)
    assert.deepEqual(p.done.a, { correct: true })
  })

  it('不修改原对象', () => {
    const p0 = emptyProgress()
    recordResult(p0, 'a', true)
    assert.equal(p0.attempted, 0)
  })
})

describe('accuracy', () => {
  it('无记录为 0，否则四舍五入百分比', () => {
    assert.equal(accuracy(emptyProgress()), 0)
    assert.equal(accuracy({ attempted: 3, correct: 2, sessions: 0, done: {} }), 67)
  })
})

describe('bumpSession', () => {
  it('自增完成轮数', () => {
    assert.equal(bumpSession(emptyProgress()).sessions, 1)
  })
})

describe('pickSession', () => {
  const clips = ['a', 'b', 'c', 'd'].map(clip)

  it('未做过的优先，数量不超过 size', () => {
    const p = recordResult(recordResult(emptyProgress(), 'a', true), 'b', true)
    const picked = pickSession(clips, p, 2, () => 0.5)
    // a,b done → c,d 应先出现
    assert.deepEqual(picked.map((c) => c.id).sort(), ['c', 'd'])
  })

  it('全做过时仍能凑满一轮', () => {
    let p = emptyProgress()
    for (const c of clips) p = recordResult(p, c.id, true)
    const picked = pickSession(clips, p, 3, () => 0.5)
    assert.equal(picked.length, 3)
  })
})
