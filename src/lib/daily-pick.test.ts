import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dailyIndex, pickDaily, todaySeed } from './daily-pick'

describe('dailyIndex', () => {
  it('同一天同一列表 -> 同一索引 (确定性)', () => {
    assert.equal(dailyIndex('2026-07-16', 15), dailyIndex('2026-07-16', 15))
  })

  it('索引永远在界内', () => {
    for (let d = 1; d <= 31; d++) {
      const i = dailyIndex(`2026-07-${String(d).padStart(2, '0')}`, 15)
      assert.ok(i >= 0 && i < 15, `2026-07-${d} -> ${i}`)
    }
  })

  it('不同日期在一个月内覆盖多个索引 (不是常数函数)', () => {
    const seen = new Set<number>()
    for (let d = 1; d <= 31; d++) {
      seen.add(dailyIndex(`2026-07-${String(d).padStart(2, '0')}`, 15))
    }
    assert.ok(seen.size >= 5, `31 天只出现 ${seen.size} 种索引`)
  })

  it('空列表 -> 0，pickDaily -> null', () => {
    assert.equal(dailyIndex('2026-07-16', 0), 0)
    assert.equal(pickDaily([], '2026-07-16'), null)
  })
})

describe('todaySeed', () => {
  it('用本地日期并补零', () => {
    assert.equal(todaySeed(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
  })
})
