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

const card = (id: string, answer: string, note = `s/${id}`): Card => ({
  id,
  noteSlug: note,
  noteHref: `/notes/${note}/`,
  anchor: '',
  noteTitle: id,
  subject: 'cs',
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
  // Same note => on-topic by construction; questions build from these.
  const pool = [
    card('a', '<p>答案A</p>', 'shared'),
    card('b', '<p>答案B</p>', 'shared'),
    card('c', '<p>答案C</p>', 'shared'),
    card('d', '<p>答案D</p>', 'shared'),
    card('e', '<p>答案E</p>', 'shared'),
  ]

  it('四个选项、correctIndex 指向真答案', () => {
    const q = buildChoiceQuestion(pool[0], pool, seq(0.1, 0.5, 0.9, 0.3))!
    assert.equal(q.options.length, 4)
    assert.equal(q.options[q.correctIndex], '答案A')
  })

  it('干扰项不含正确答案、互不重复', () => {
    const dup = [...pool, card('f', '<p>答案A</p>', 'shared')] // same text as the right answer
    for (let s = 0; s < 20; s++) {
      const q = buildChoiceQuestion(dup[0], dup, seq(s / 20, 0.4, 0.7))!
      const others = q.options.filter((_, i) => i !== q.correctIndex)
      assert.ok(!others.includes('答案A'), '干扰项混入了正确答案')
      assert.equal(new Set(q.options).size, 4, '选项重复')
    }
  })

  it('干扰项不足 3 个 -> null（两个选项是抛硬币不是题）', () => {
    const tiny = [card('a', '<p>x</p>', 'shared'), card('b', '<p>y</p>', 'shared')]
    assert.equal(buildChoiceQuestion(tiny[0], tiny), null)
  })

  it('同笔记的干扰项优先于不相关的卡', () => {
    const mixed = [...pool, card('x', '<p>毫无关联的另一个领域的答案X</p>', 'far/away')]
    const q = buildChoiceQuestion(mixed[0], mixed, seq(0.01))!
    const others = q.options.filter((_, i) => i !== q.correctIndex)
    assert.ok(!others.some((o) => o.includes('答案X')), '同笔记够用时不该抽不相关的卡')
  })

  it('主题相关的干扰项不足 2 个 -> null（送分题不如不出）', () => {
    // One same-note sibling + two cards with zero lexical overlap: the two
    // strays would visibly answer different questions, giving the answer away.
    const giveaway = [
      card('a', '<p>按位分桶保持相对顺序</p>', 'sort'),
      card('b', '<p>低位在前逐位处理</p>', 'sort'),
      card('x', '<p>光栅化吞吐要求极高</p>', 'gfx'),
      card('y', '<p>特征向量构成正交基</p>', 'la'),
    ]
    assert.equal(buildChoiceQuestion(giveaway[0], giveaway), null)
  })

  it('跨笔记但文本高度相关的卡可以当干扰项', () => {
    const related = [
      card('a', '<p>虚函数通过虚表指针间接调用实现多态</p>', 'cpp/a'),
      card('b', '<p>虚表指针在构造函数里被逐层设置</p>', 'cpp/b'),
      card('c', '<p>虚函数的虚表在编译期生成每类一份</p>', 'cpp/c'),
      card('d', '<p>析构函数是虚函数时删除指针才安全</p>', 'cpp/d'),
    ]
    const q = buildChoiceQuestion(related[0], related, seq(0.2, 0.6, 0.4))
    assert.ok(q, '高相似度的跨笔记卡应该够出题')
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
    card('a', TERM_HTML, 'shared'),
    card('b', '<p>答案B</p>', 'shared'),
    card('c', '<p>答案C</p>', 'shared'),
    card('d', '<p>答案D</p>', 'shared'),
    card('e', '<p>答案E</p>', 'shared'),
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
