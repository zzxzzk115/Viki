import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import rehypeParse from 'rehype-parse'
import rehypeStringify from 'rehype-stringify'
import { unified } from 'unified'
import { rehypeBasePath } from './rehype-base-path'

const run = (html: string, base = '/Viki') =>
  String(
    unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeBasePath, { base })
      .use(rehypeStringify)
      .processSync(html),
  )

describe('rehypeBasePath', () => {
  it('给根相对链接加前缀', () => {
    assert.equal(run('<a href="/notes/foo/">x</a>'), '<a href="/Viki/notes/foo/">x</a>')
  })

  it('给根相对图片加前缀', () => {
    assert.equal(run('<img src="/img/a.png">'), '<img src="/Viki/img/a.png">')
  })

  it('不碰锚点', () => {
    assert.equal(run('<a href="#物理约束">x</a>'), '<a href="#物理约束">x</a>')
  })

  it('不碰外链', () => {
    assert.equal(run('<a href="https://arxiv.org/abs/1">x</a>'), '<a href="https://arxiv.org/abs/1">x</a>')
  })

  it('不碰协议相对 URL', () => {
    assert.equal(run('<a href="//cdn.example.com/x">x</a>'), '<a href="//cdn.example.com/x">x</a>')
  })

  it('不碰相对路径', () => {
    assert.equal(run('<a href="./sibling/">x</a>'), '<a href="./sibling/">x</a>')
  })

  it('不重复加前缀', () => {
    assert.equal(run('<a href="/Viki/notes/foo/">x</a>'), '<a href="/Viki/notes/foo/">x</a>')
  })

  it('不把 /Vikings 误判为已加前缀', () => {
    // '/Vikings/...' must not be mistaken for an already-prefixed '/Viki/...'
    assert.equal(run('<a href="/Vikings/x/">x</a>'), '<a href="/Viki/Vikings/x/">x</a>')
  })

  it('base 为空时完全不动 (自定义域名场景)', () => {
    assert.equal(run('<a href="/notes/foo/">x</a>', ''), '<a href="/notes/foo/">x</a>')
  })

  it('处理同一元素上的多个属性', () => {
    const out = run('<img src="/a.png" href="/b/">')
    assert.ok(out.includes('/Viki/a.png'))
    assert.ok(out.includes('/Viki/b/'))
  })

  it('处理嵌套元素', () => {
    assert.equal(
      run('<div><p><a href="/notes/x/">a</a></p></div>'),
      '<div><p><a href="/Viki/notes/x/">a</a></p></div>',
    )
  })
})
