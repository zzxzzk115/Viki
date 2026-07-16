import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Card, Glossary } from './schema'
import {
  BLANK_MARKER,
  buildChoiceQuestion,
  buildClozeQuestion,
  buildSession,
  checkCloze,
  findBlankables,
  gradeFor,
} from './quiz'

const card = (id: string, answer: string, quiz?: Card['quiz']): Card => ({
  id,
  noteSlug: `s/${id}`,
  noteHref: `/notes/s/${id}/`,
  anchor: '',
  noteTitle: id,
  subject: 'cs',
  level: 'basic',
  tags: [],
  questionHtml: `<p>Q-${id}?</p>`,
  answerHtml: answer,
  quiz,
})

// The real shape the pipeline emits: term-en nested INSIDE the term span.
const TERM_HTML =
  '<p>渲染方程用 <span class="term" data-term="辐射亮度" title="radiance — 沿光线不变">辐射亮度<span class="term-en"> (radiance)</span></span> 表示。</p>'

const glossary: Glossary = {
  辐射亮度: { en: 'radiance', def: '沿光线不变', abbr: undefined, aka: ['亮度'], see: undefined },
}

const QUIZ = { correct: '对的表述', distractors: ['错 1', '错 2', '错 3'] }

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

describe('buildChoiceQuestion（选项来自卡片自己的 :::quiz，不再采集其他卡）', () => {
  it('4 个选项、correctIndex 指向正确项', () => {
    for (let s = 0; s < 10; s++) {
      const q = buildChoiceQuestion(card('a', '<p>x</p>', QUIZ), seq(s / 10, 0.4, 0.8))!
      assert.equal(q.options.length, 4)
      assert.equal(q.options[q.correctIndex], '对的表述')
      assert.deepEqual([...q.options].sort(), ['对的表述', '错 1', '错 2', '错 3'])
    }
  })

  it('没有 :::quiz 块 -> null', () => {
    assert.equal(buildChoiceQuestion(card('a', '<p>x</p>')), null)
  })
})

describe('findBlankables（术语 + 加粗关键词）', () => {
  it('术语 span 可挖，accepted 含中英/别名', () => {
    const bs = findBlankables(TERM_HTML, glossary)
    assert.equal(bs.length, 1)
    assert.equal(bs[0].kind, 'term')
    assert.deepEqual(bs[0].accepted, ['辐射亮度', 'radiance', '亮度'])
  })

  it('加粗关键词可挖，accepted 是其文本', () => {
    const bs = findBlankables('<p>开销是 <strong>无法内联</strong>，别的都是小头。</p>', {})
    assert.equal(bs.length, 1)
    assert.equal(bs[0].kind, 'keyword')
    assert.deepEqual(bs[0].accepted, ['无法内联'])
  })

  it('文本出现多于一次的关键词不挖（挖一处、另一处漏答案）', () => {
    const bs = findBlankables('<p><strong>基类</strong>的构造先跑，基类部分先完成。</p>', {})
    assert.equal(bs.length, 0)
  })

  it('过长的加粗（整句）不挖', () => {
    const bs = findBlankables(`<p><strong>${'长'.repeat(30)}</strong></p>`, {})
    assert.equal(bs.length, 0)
  })

  it('包住术语 span 的加粗跳过（术语路径的 accepted 更全）', () => {
    const html = `<p><strong>${TERM_HTML.slice(3, -4)}</strong></p>`
    const bs = findBlankables(html, glossary)
    assert.deepEqual(
      bs.map((b) => b.kind),
      ['term'],
    )
  })
})

describe('buildClozeQuestion', () => {
  it('挖掉整个 term span（含嵌套的英文标注），周围文本保留', () => {
    const q = buildClozeQuestion(card('a', TERM_HTML), glossary, seq(0))!
    assert.ok(q.blankedHtml.includes(BLANK_MARKER))
    assert.ok(!q.blankedHtml.includes('辐射亮度'), '中文术语泄漏')
    assert.ok(!q.blankedHtml.includes('radiance'), '嵌套的英文标注泄漏——正好是答案！')
    assert.ok(q.blankedHtml.includes('渲染方程用') && q.blankedHtml.includes('表示。'))
  })

  it('接受 中文/英文/别名，大小写与空白归一', () => {
    const q = buildClozeQuestion(card('a', TERM_HTML), glossary, seq(0))!
    assert.ok(checkCloze('辐射亮度', q.accepted))
    assert.ok(checkCloze('  Radiance ', q.accepted))
    assert.ok(checkCloze('亮度', q.accepted))
    assert.ok(!checkCloze('辐照度', q.accepted))
  })

  it('挖加粗关键词时 blanked 不再含该词', () => {
    const q = buildClozeQuestion(card('a', '<p>贵在 <strong>无法内联</strong> 这一点。</p>'), {}, seq(0))!
    assert.ok(!q.blankedHtml.includes('无法内联'))
    assert.ok(checkCloze('无法内联', q.accepted))
  })

  it('无可挖内容的卡 -> null', () => {
    assert.equal(buildClozeQuestion(card('a', '<p>plain</p>'), glossary), null)
  })
})

describe('buildSession', () => {
  const pool = [
    card('a', TERM_HTML), // cloze only
    card('b', '<p>答案B</p>', QUIZ), // choice only
    card('c', '<p>答案C <strong>关键词C</strong></p>', QUIZ), // both
    card('d', '<p>答案D</p>'), // neither — not quizzable
    card('e', '<p>答案E</p>', QUIZ),
  ]

  it('生成 n 题，到期优先，不可出题的卡被跳过', () => {
    const qs = buildSession(pool, new Set(['c']), new Set(['a']), glossary, 10, seq(0.9, 0.2, 0.6))
    assert.equal(qs[0].card.id, 'c', '到期卡应排第一')
    assert.ok(!qs.some((q) => q.card.id === 'd'), '无 quiz 也无关键词的卡不该出题')
    assert.equal(qs.length, 4)
  })

  it('池子小于 n 时不重复出题', () => {
    const qs = buildSession(pool, new Set(), new Set(), glossary, 10, seq(0.3, 0.8))
    assert.equal(new Set(qs.map((q) => q.card.id)).size, qs.length)
  })

  it('两种题型都会出现（有 quiz 的出选择、有术语的出填空）', () => {
    const qs = buildSession(pool, new Set(), new Set(), glossary, 10, seq(0.1, 0.6, 0.3, 0.8))
    const modes = new Set(qs.map((q) => q.mode))
    assert.ok(modes.has('choice') && modes.has('cloze'))
  })
})
