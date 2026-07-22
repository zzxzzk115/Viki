import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Word } from './schema'
import { blankWord, buildSpellQuestion, checkSpelling, gradeSpell, WORD_BLANK } from './vocab-quiz'

const word = (over: Partial<Word> = {}): Word => ({
  id: 'w1',
  word: 'abandon',
  meaningHtml: '<p>放弃</p>',
  exampleHtml: '<p>He abandoned his car; Abandon ship!</p>',
  noteSlug: 's',
  noteHref: '/notes/s/',
  noteTitle: 's',
  ...over,
})

describe('blankWord', () => {
  it('挖掉例句里所有整词出现（大小写、时态变形保守处理）', () => {
    const out = blankWord('<p>He abandoned; Abandon ship!</p>', 'abandon')
    // "Abandon" (whole word) blanked; "abandoned" contains the stem but \b后是 ed，不是整词
    assert.ok(out.includes(WORD_BLANK))
    assert.ok(!/\bAbandon\b/.test(out.replace(/ed/g, '')))
  })

  it('正则元字符不炸', () => {
    assert.doesNotThrow(() => blankWord('<p>a (b) c</p>', 'a(b)c'))
  })
})

describe('buildSpellQuestion', () => {
  it('给出挖空例句与可接受拼写', () => {
    const q = buildSpellQuestion(word())
    assert.ok(q.blankedExampleHtml?.includes(WORD_BLANK))
    assert.deepEqual(q.accepted, ['abandon'])
  })

  it('无例句 -> blankedExampleHtml 为 null', () => {
    const q = buildSpellQuestion(word({ exampleHtml: undefined }))
    assert.equal(q.blankedExampleHtml, null)
  })
})

describe('checkSpelling / gradeSpell', () => {
  it('大小写/空白归一', () => {
    const q = buildSpellQuestion(word())
    assert.ok(checkSpelling('  Abandon ', q.accepted))
    assert.ok(!checkSpelling('abandonn', q.accepted))
  })
  it('对=5 错=0', () => {
    assert.equal(gradeSpell(true), 5)
    assert.equal(gradeSpell(false), 0)
  })
})
