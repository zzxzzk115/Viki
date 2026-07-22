import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planSegments } from './listening-segment'

const S = (n: number) => Array.from({ length: n }, (_, i) => `Sentence number ${i + 1} has some words here.`)

describe('planSegments', () => {
  it('groups sentences into ~targetWords segments covering all text', () => {
    const sents = S(9) // 7 words each = 63 words
    const segs = planSegments(sents, 0, 20)
    // Every sentence appears exactly once, in order.
    assert.equal(segs.map((s) => s.text).join(' '), sents.join(' '))
    // Each segment (except maybe the last) is at least ~targetWords.
    assert.ok(segs.length >= 3)
  })

  it('first segment starts at 0, last ends at 1', () => {
    const segs = planSegments(S(6), 5, 15)
    assert.equal(segs[0].startFrac, 0)
    assert.equal(segs[segs.length - 1].endFrac, 1)
  })

  it('windows are contiguous and increasing', () => {
    const segs = planSegments(S(8), 3, 14)
    for (let i = 0; i < segs.length; i++) {
      assert.ok(segs[i].endFrac > segs[i].startFrac, 'end after start')
      if (i > 0) assert.equal(segs[i].startFrac, segs[i - 1].endFrac, 'contiguous')
    }
  })

  it('titleWords pushes body boundaries later in the clip', () => {
    const withTitle = planSegments(S(4), 40, 7)
    const noTitle = planSegments(S(4), 0, 7)
    // A big spoken title means the first body sentence finishes later in the audio.
    assert.ok(withTitle[0].endFrac > noTitle[0].endFrac)
  })

  it('snaps boundaries to nearby pause fractions', () => {
    // One boundary; a pause slightly off the proportional estimate should win.
    const segs = planSegments(S(2), 0, 7, [0.51, 0.98])
    assert.equal(segs[0].endFrac, 0.51) // proportional ~0.5 snaps to 0.51
  })

  it('empty input yields no segments', () => {
    assert.deepEqual(planSegments([], 0), [])
  })
})
