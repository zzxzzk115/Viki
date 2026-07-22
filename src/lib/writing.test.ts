import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildFeedbackPrompt, countWords, WRITING_PROMPTS } from './writing'

describe('countWords', () => {
  it('按空白计数，空串为 0', () => {
    assert.equal(countWords('  hello   world \n foo '), 3)
    assert.equal(countWords('   '), 0)
  })
})

describe('WRITING_PROMPTS', () => {
  it('雅思与学术两类都有，字段完整', () => {
    assert.ok(WRITING_PROMPTS.some((p) => p.mode === 'ielts'))
    assert.ok(WRITING_PROMPTS.some((p) => p.mode === 'academic'))
    for (const p of WRITING_PROMPTS) {
      assert.ok(p.id && p.title && p.prompt && p.minWords > 0)
    }
    assert.equal(new Set(WRITING_PROMPTS.map((p) => p.id)).size, WRITING_PROMPTS.length, 'id 不重复')
  })
})

describe('buildFeedbackPrompt', () => {
  it('雅思：四项标准 + 题目 + 作文 + 词数', () => {
    const p = WRITING_PROMPTS.find((x) => x.mode === 'ielts')!
    const r = buildFeedbackPrompt(p, 'This is my essay about the topic.')
    assert.ok(r.system.includes('Task Response') && r.system.includes('Grammatical Range'))
    assert.ok(r.messages[0].content.includes(p.prompt))
    assert.ok(r.messages[0].content.includes('This is my essay'))
    assert.ok(/\d+ 词/.test(r.messages[0].content))
  })

  it('学术：语体维度而非雅思分段', () => {
    const p = WRITING_PROMPTS.find((x) => x.mode === 'academic')!
    const r = buildFeedbackPrompt(p, 'We did stuff.')
    assert.ok(r.system.includes('学术语体') && r.system.includes('hedging'))
    assert.ok(!r.system.includes('band 5'))
  })
})
