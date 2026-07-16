import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { selectWithQuota } from './feed-select'

const p = (topic: string, score: number) => ({ topic, score })

describe('selectWithQuota', () => {
  it('高分主题不能霸榜 —— 每个主题拿到保底名额', () => {
    // 10 foveated papers scoring 50+, 3 warping papers scoring 15.
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => p('注视点渲染', 50 + i)),
      p('图像变形', 15),
      p('图像变形', 14),
      p('图像补全', 12),
    ]
    const out = selectWithQuota(pool, ['注视点渲染', '图像变形', '图像补全'], 2, 8)
    const byTopic = (t: string) => out.filter((x) => x.topic === t).length
    // Without quotas the top 8 would be 8 foveated papers.
    assert.equal(byTopic('图像变形'), 2, '图像变形保底 2')
    assert.equal(byTopic('图像补全'), 1, '图像补全有 1 篇就上 1 篇')
    assert.equal(out.length, 8)
    assert.equal(byTopic('注视点渲染'), 5, '剩余名额归还高分主题')
  })

  it('主题内部按分数取最好的', () => {
    const pool = [p('a', 5), p('a', 9), p('a', 7)]
    const out = selectWithQuota(pool, ['a'], 2, 2)
    assert.deepEqual(out.map((x) => x.score), [9, 7])
  })

  it('空主题的名额回流自由竞争', () => {
    const pool = [p('a', 10), p('a', 9), p('a', 8), p('a', 7)]
    const out = selectWithQuota(pool, ['a', 'b'], 2, 4)
    assert.equal(out.length, 4, 'b 无候选时名额不浪费')
  })

  it('无主题 (topic="") 的论文可走自由名额', () => {
    const pool = [p('a', 10), p('', 9), p('', 8)]
    const out = selectWithQuota(pool, ['a'], 1, 3)
    assert.equal(out.length, 3)
    assert.ok(out.some((x) => x.topic === ''))
  })

  it('输出按分数降序（配额决定在场，不决定排位）', () => {
    const pool = [p('b', 3), p('a', 10), p('b', 20)]
    const out = selectWithQuota(pool, ['a', 'b'], 1, 3)
    assert.deepEqual(out.map((x) => x.score), [20, 10, 3])
  })

  it('limit 硬上限', () => {
    const pool = Array.from({ length: 20 }, (_, i) => p('a', i))
    assert.equal(selectWithQuota(pool, ['a'], 5, 3).length, 3)
  })
})
