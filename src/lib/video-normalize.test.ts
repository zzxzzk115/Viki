import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { youtubeRssToVideos } from './video-normalize'

const entry = {
  'yt:videoId': 'abc123',
  title: 'How Nanite Works',
  link: { '@_href': 'https://www.youtube.com/watch?v=abc123' },
  author: { name: 'Two Minute Papers' },
  published: '2026-07-16T10:00:00+00:00',
  'media:group': { 'media:thumbnail': { '@_url': 'https://i.ytimg.com/vi/abc123/hqdefault.jpg' } },
}

describe('youtubeRssToVideos', () => {
  it('Atom entry → VideoItem（videoId/channel/thumb/published/category）', () => {
    const [v] = youtubeRssToVideos([entry], '图形学')
    assert.equal(v.platform, 'youtube')
    assert.equal(v.videoId, 'abc123')
    assert.equal(v.title, 'How Nanite Works')
    assert.equal(v.channel, 'Two Minute Papers')
    assert.equal(v.thumb, 'https://i.ytimg.com/vi/abc123/hqdefault.jpg')
    assert.equal(v.published, '2026-07-16')
    assert.equal(v.category, '图形学')
  })

  it('缺 videoId 或 title 的条目跳过', () => {
    assert.equal(youtubeRssToVideos([{ title: 'x' }, { 'yt:videoId': 'y' }], 'x').length, 0)
  })

  it('无缩略图时回落到 i.ytimg 默认图', () => {
    const [v] = youtubeRssToVideos([{ 'yt:videoId': 'z9', title: 't' }], 'cs')
    assert.ok(v.thumb.includes('/vi/z9/'))
  })
})
