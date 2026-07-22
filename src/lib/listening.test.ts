import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildDictation, checkDictation, checkWord, normalizeWord } from './listening'

const seq = (...v: number[]) => {
  let i = 0
  return () => v[i++ % v.length]
}

describe('normalizeWord', () => {
  it('小写、剥两端标点、保留内部撇号', () => {
    assert.equal(normalizeWord('Buddhism?'), 'buddhism')
    assert.equal(normalizeWord('"Don\'t"'), "don't")
    assert.equal(normalizeWord('credit.'), 'credit')
  })
})

describe('buildDictation', () => {
  it('挖空内容词（≥3 字母、非停用词），停用词不挖', () => {
    const d = buildDictation('Are you interested in Buddhism', seq(0.9, 0.1, 0.5), 3)
    const blankedWords = d.tokens.filter((t) => t.blank).map((t) => normalizeWord(t.raw))
    assert.ok(blankedWords.length >= 1)
    // stopwords are never blanked
    for (const w of blankedWords) assert.ok(!['are', 'you', 'in'].includes(w))
    // answers align with blanked tokens in order
    assert.deepEqual(
      d.tokens.filter((t) => t.blank).map((t) => normalizeWord(t.raw)),
      d.answers,
    )
  })

  it('token 顺序保留完整句子', () => {
    const d = buildDictation("Don't buy things on credit.", seq(0.5))
    assert.equal(d.tokens.map((t) => t.raw).join(' '), "Don't buy things on credit.")
  })

  it('全是停用词的短句也至少挖一个', () => {
    const d = buildDictation('We are all angry', seq(0.5))
    assert.ok(d.answers.length >= 1)
  })
})

describe('checkDictation', () => {
  it('大小写/标点无关，逐空判定', () => {
    const answers = ['buddhism', 'interested']
    assert.deepEqual(checkDictation(['Buddhism?', 'INTERESTED'], answers), [true, true])
    assert.deepEqual(checkDictation(['budism', ''], answers), [false, false])
  })
  it('checkWord 归一比较', () => {
    assert.ok(checkWord('  Credit. ', 'credit'))
    assert.ok(!checkWord('debit', 'credit'))
  })
})
