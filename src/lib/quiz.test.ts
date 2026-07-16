import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Card, Glossary } from './schema'
import {
  BLANK_MARKER,
  blankTermSpan,
  buildChoiceQuestion,
  buildClozeQuestion,
  buildSession,
  checkCloze,
  extractTerms,
  gradeFor,
} from './quiz'

const card = (id: string, answer: string, subject = 'cs'): Card => ({
  id,
  noteSlug: `s/${id}`,
  noteHref: `/notes/s/${id}/`,
  anchor: '',
  noteTitle: id,
  subject,
  level: 'basic',
  tags: [],
  questionHtml: `<p>Q-${id}?</p>`,
  answerHtml: answer,
})

// The real shape the pipeline emits: term-en nested INSIDE the term span.
const TERM_HTML =
  '<p>渲染方程用 <span class="term" data-term="辐射亮度" title="radiance — 沿光线不变">辐射亮度<span class="term-en"> (radiance)</span></span> 表示。</p>'

const glossary: Glossary = {
  辐射亮度: { en: 'radiance', def: '沿光线不变', abbr: undefined, aka: ['亮度'], see: undefined },
}

const seq = (...vals: number[]) => {
  let i = 0
  return () => vals[i++ % vals.length]
}

describe('gradeFor', () => {
  it('打通但降档：选择对=3、填空对=5、错=0', () => {
    assert.equal(gradeFor('choice', true), 3)
    assert.equal(gradeFor('cloze', true), 5)
    assert.equal(gradeFor('choice', false), 0)
    assert.equal(gradeFor('cloze', false), 0)
  })
})

describe('buildChoiceQuestion', () => {
  const pool = [
    card('a', '<p>答案A</p>'),
    card('b', '<p>答案B</p>'),
    card('c', '<p>答案C</p>'),
    card('d', '<p>答案D</p>'),
    card('e', '<p>答案E</p>'),
  ]

  it('四个选项、correctIndex 指向真答案', () => {
    const q = buildChoiceQuestion(pool[0], pool, seq(0.1, 0.5, 0.9, 0.3))!
    assert.equal(q.options.length, 4)
    assert.equal(q.options[q.correctIndex], '答案A')
  })

  it('干扰项不含正确答案、互不重复', () => {
    const dup = [...pool, card('f', '<p>答案A</p>')] // same text as the right answer
    for (let s = 0; s < 20; s++) {
      const q = buildChoiceQuestion(dup[0], dup, seq(s / 20, 0.4, 0.7))!
      const others = q.options.filter((_, i) => i !== q.correctIndex)
      assert.ok(!others.includes('答案A'), '干扰项混入了正确答案')
      assert.equal(new Set(q.options).size, 4, '选项重复')
    }
  })

  it('干扰项不足 3 个 -> null（两个选项是抛硬币不是题）', () => {
    const tiny = [card('a', '<p>x</p>'), card('b', '<p>y</p>')]
    assert.equal(buildChoiceQuestion(tiny[0], tiny), null)
  })

  it('同科目干扰项优先', () => {
    const mixed = [
      card('a', '<p>A</p>', 'cs'),
      card('b', '<p>B</p>', 'cs'),
      card('c', '<p>C</p>', 'cs'),
      card('d', '<p>D</p>', 'cs'),
      card('x', '<p>X</p>', 'math'),
    ]
    const q = buildChoiceQuestion(mixed[0], mixed, seq(0.01))!
    const others = q.options.filter((_, i) => i !== q.correctIndex)
    assert.ok(!others.includes('X'), '同科目够用时不该抽外科目')
  })
})

describe('cloze', () => {
  it('extractTerms 找到 data-term', () => {
    assert.deepEqual(extractTerms(TERM_HTML), ['辐射亮度'])
  })

  it('挖空替换整个 term span（含嵌套的 term-en）', () => {
    const blanked = blankTermSpan(TERM_HTML, '辐射亮度')!
    assert.ok(blanked.includes(BLANK_MARKER))
    assert.ok(!blanked.includes('辐射亮度'), '中文术语泄漏')
    assert.ok(!blanked.includes('radiance'), '嵌套的英文标注泄漏——正好是答案！')
    assert.ok(blanked.includes('渲染方程用') && blanked.includes('表示。'), '周围文本保留')
  })

  it('接受 中文/英文/别名，大小写与空白归一', () => {
    const q = buildClozeQuestion(card('a', TERM_HTML), glossary, seq(0))!
    assert.ok(checkCloze('辐射亮度', q.accepted))
    assert.ok(checkCloze('  Radiance ', q.accepted))
    assert.ok(checkCloze('亮度', q.accepted))
    assert.ok(!checkCloze('辐照度', q.accepted))
  })

  it('无术语的卡 -> null', () => {
    assert.equal(buildClozeQuestion(card('a', '<p>plain</p>'), glossary), null)
  })

  it('span 未闭合 -> null 而非错误输出', () => {
    assert.equal(blankTermSpan('<span class="term" data-term="x">broken', 'x'), null)
  })
})

describe('buildSession', () => {
  const pool = [
    card('a', TERM_HTML),
    card('b', '<p>答案B</p>'),
    card('c', '<p>答案C</p>'),
    card('d', '<p>答案D</p>'),
    card('e', '<p>答案E</p>'),
  ]

  it('生成 n 题，到期优先', () => {
    const qs = buildSession(pool, new Set(['c']), new Set(['a']), glossary, 3, seq(0.9, 0.2, 0.6))
    assert.equal(qs.length, 3)
    assert.equal(qs[0].card.id, 'c', '到期卡应排第一')
  })

  it('池子小于 n 时不重复出题', () => {
    const qs = buildSession(pool, new Set(), new Set(), glossary, 10, seq(0.3, 0.8))
    assert.ok(qs.length <= pool.length)
    assert.equal(new Set(qs.map((q) => q.card.id)).size, qs.length)
  })
})
