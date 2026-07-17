import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { invertAbstract } from './openalex'

describe('invertAbstract', () => {
  it('按位置还原词序（键序无关、重复词多位置）', () => {
    const inv = { world: [1], hello: [0], again: [3], hello2: [] as number[], and: [2] }
    assert.equal(invertAbstract(inv), 'hello world and again')
    assert.equal(invertAbstract({ a: [0, 2], b: [1] }), 'a b a')
  })

  it('空/缺失 -> 空串', () => {
    assert.equal(invertAbstract(null), '')
    assert.equal(invertAbstract(undefined), '')
    assert.equal(invertAbstract({}), '')
  })
})
