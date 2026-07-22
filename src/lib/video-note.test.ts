import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildVideoNote, parseVideoUrl, videoSlug, videoUrl } from './video-note'

describe('parseVideoUrl', () => {
  it('识别 YouTube 各种形态', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ?start=10',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=5s',
    ]) {
      assert.deepEqual(parseVideoUrl(u), { platform: 'youtube', id: 'dQw4w9WgXcQ' }, u)
    }
  })

  it('识别 Bilibili BV 号', () => {
    assert.deepEqual(parseVideoUrl('https://www.bilibili.com/video/BV1xx411c7mD'), {
      platform: 'bilibili',
      id: 'BV1xx411c7mD',
    })
    assert.deepEqual(parseVideoUrl('BV1xx411c7mD'), { platform: 'bilibili', id: 'BV1xx411c7mD' })
  })

  it('非视频 URL → null', () => {
    assert.equal(parseVideoUrl('https://example.com/x'), null)
    assert.equal(parseVideoUrl('not a url'), null)
  })
})

describe('videoUrl', () => {
  it('还原规范观看链接', () => {
    assert.equal(videoUrl({ platform: 'youtube', id: 'abc' }), 'https://www.youtube.com/watch?v=abc')
    assert.equal(videoUrl({ platform: 'bilibili', id: 'BV1' }), 'https://www.bilibili.com/video/BV1')
  })
})

describe('videoSlug', () => {
  it('去停用词、kebab、截断；空标题回落 id', () => {
    assert.equal(videoSlug('How the GPU Works in Real Time', 'x'), 'gpu-works-real-time')
    assert.equal(videoSlug('!!!', 'BV1xx'), 'bv1xx')
  })
})

describe('buildVideoNote', () => {
  it('frontmatter 含 video 字段与 title/tags', () => {
    const md = buildVideoNote({
      platform: 'youtube',
      id: 'abc123',
      title: 'GPU 架构讲解',
      channel: 'Two Minute Papers',
      category: '图形学',
      tags: ['GPU'],
    })
    assert.ok(md.startsWith('---'))
    assert.ok(md.includes('video: { platform: youtube, id: "abc123", channel: "Two Minute Papers" }'))
    assert.ok(md.includes('title: "GPU 架构讲解"'))
    assert.ok(md.includes('视频') && md.includes('图形学') && md.includes('GPU'))
    assert.ok(md.includes('## 笔记'))
  })

  it('无 channel 时 video 字段不带 channel', () => {
    const md = buildVideoNote({ platform: 'bilibili', id: 'BV1', title: '标题' })
    assert.ok(md.includes('video: { platform: bilibili, id: "BV1" }'))
  })
})
