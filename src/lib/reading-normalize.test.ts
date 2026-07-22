import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { capSummary, hnStoryToReading, rssItemsToReading, stripHtml, wikiTfaToReading } from './reading-normalize'

describe('stripHtml / capSummary', () => {
  it('去标签、解实体、压空白', () => {
    assert.equal(stripHtml('<p>a &amp; b<br> c</p>'), 'a & b c')
  })
  it('超长截断带省略号', () => {
    assert.equal(capSummary('x'.repeat(300)).length, 280)
    assert.ok(capSummary('x'.repeat(300)).endsWith('…'))
  })
})

describe('rssItemsToReading', () => {
  it('RSS item → ReadingItem（摘要去 HTML、tags、作者）', () => {
    const items = [
      {
        title: 'Hello <b>World</b>',
        link: 'https://dev.to/a',
        description: '<p>Some <i>summary</i> text.</p>',
        pubDate: 'Wed, 16 Jul 2026 00:00:00 GMT',
        'dc:creator': 'Ada',
        category: ['webdev', 'js'],
      },
    ]
    const [r] = rssItemsToReading(items, 'DEV', 'tech')
    assert.equal(r.title, 'Hello World')
    assert.equal(r.url, 'https://dev.to/a')
    assert.equal(r.summary, 'Some summary text.')
    assert.equal(r.author, 'Ada')
    assert.deepEqual(r.tags, ['webdev', 'js'])
  })

  it('Atom entry（link 为对象 @_href）', () => {
    const [r] = rssItemsToReading([{ title: 'T', link: { '@_href': 'https://x/1' }, summary: 'S' }], 'X', 'tech')
    assert.equal(r.url, 'https://x/1')
  })

  it('缺 title 或 link 的条目被跳过', () => {
    assert.equal(rssItemsToReading([{ title: 'no link' }, { link: 'https://x' }], 'X', 'tech').length, 0)
  })
})

describe('hnStoryToReading', () => {
  it('link 故事 → ReadingItem，score 进 tags', () => {
    const r = hnStoryToReading({ type: 'story', title: 'A', url: 'https://x', by: 'pg', time: 1780000000, score: 120 }, 'HN')!
    assert.equal(r.category, 'tech')
    assert.equal(r.url, 'https://x')
    assert.equal(r.author, 'pg')
    assert.ok(r.tags[0].includes('120'))
  })
  it('非 story 类型 → null', () => {
    assert.equal(hnStoryToReading({ type: 'comment', title: 'x' }, 'HN'), null)
  })
})

describe('wikiTfaToReading', () => {
  it('tfa → ReadingItem（extract 作摘要、下划线转空格）', () => {
    const r = wikiTfaToReading(
      { normalizedtitle: 'Alan Turing', extract: 'A mathematician.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Alan_Turing' } } },
      'Wikipedia',
      'culture',
    )!
    assert.equal(r.title, 'Alan Turing')
    assert.equal(r.url, 'https://en.wikipedia.org/wiki/Alan_Turing')
    assert.equal(r.summary, 'A mathematician.')
  })
  it('缺 page → null', () => {
    assert.equal(wikiTfaToReading({ title: 'x' }, 'W', 'culture'), null)
  })
})
