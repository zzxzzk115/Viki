import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Element, Root } from 'hast'
import rehypeParse from 'rehype-parse'
import rehypeStringify from 'rehype-stringify'
import remarkDirective from 'remark-directive'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import type { Glossary } from '@/lib/schema'
import { remarkTerms } from './remark-terms'

const glossary: Glossary = {
  辐射亮度: { en: 'radiance', def: '沿光线不变', aka: ['亮度'] },
  立体角: { en: 'solid angle', aka: [] },
  最小可分辨角: { en: 'minimum angle of resolution', abbr: 'MAR', def: '能分辨的最小角度', aka: [] },
}

function run(md: string) {
  const file = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkTerms, { glossary })
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync(md)
  return { html: String(file), data: file.data }
}

/**
 * Whether each .term span for `term` carries an English annotation, in
 * document order. Parses the HTML rather than regexing it: .term-en is nested
 * inside .term, and a regex cannot reliably find the matching close tag.
 */
function annotations(html: string, term: string): boolean[] {
  const tree = unified().use(rehypeParse, { fragment: true }).parse(html) as Root
  const out: boolean[] = []
  visit(tree, 'element', (node: Element) => {
    if (node.properties?.dataTerm !== term) return
    let hasEn = false
    visit(node, 'element', (child: Element) => {
      const cls = child.properties?.className
      if (Array.isArray(cls) && cls.includes('term-en')) hasEn = true
    })
    out.push(hasEn)
  })
  return out
}

describe('remarkTerms', () => {
  it('渲染成中文 + 英文', () => {
    const { html } = run('这是:term[辐射亮度]。')
    assert.match(html, /辐射亮度/)
    assert.match(html, /\(radiance\)/)
  })

  it('title 含英文和定义', () => {
    const { html } = run('这是:term[辐射亮度]。')
    assert.match(html, /title="radiance — 沿光线不变"/)
  })

  it('有缩写时渲染成「全拼, 缩写」—— 缩写才是文献里用的形式', () => {
    const { html } = run('这是:term[最小可分辨角]。')
    assert.match(html, /\(minimum angle of resolution, MAR\)/)
  })

  it('缩写也进 title', () => {
    const { html } = run('这是:term[最小可分辨角]。')
    assert.match(html, /title="minimum angle of resolution, MAR — 能分辨的最小角度"/)
  })

  it('没有缩写时不加逗号', () => {
    const { html } = run('这是:term[辐射亮度]。')
    assert.match(html, /\(radiance\)/)
    assert.ok(!html.includes('radiance,'))
  })

  it('没有定义时 title 只有英文', () => {
    const { html } = run('这是:term[立体角]。')
    assert.match(html, /title="solid angle"/)
  })

  it('首次标英文，之后不标', () => {
    const { html } = run('一次:term[辐射亮度]，二次:term[辐射亮度]，三次:term[辐射亮度]。')
    assert.deepEqual(annotations(html, '辐射亮度'), [true, false, false])
  })

  it('{en} 强制标英文', () => {
    const { html } = run('一次:term[辐射亮度]，二次:term[辐射亮度]{en}。')
    assert.deepEqual(annotations(html, '辐射亮度'), [true, true])
  })

  it('{as=} 改显示文字但仍解析原术语', () => {
    const { html } = run(':term[辐射亮度]{as=亮度}')
    assert.match(html, /data-term="辐射亮度"/)
    assert.match(html, />亮度</)
    assert.match(html, /\(radiance\)/)
  })

  it('卡片里的术语总是标英文 —— 卡片是脱离上下文复习的', () => {
    const { html } = run(`正文先出现:term[辐射亮度]。

::::card
卡片里的:term[辐射亮度]呢？

:::answer
答案里的:term[辐射亮度]。
:::
::::`)
    // prose-first, card-question, card-answer — all annotated.
    assert.deepEqual(annotations(html, '辐射亮度'), [true, true, true])
  })

  it('卡片不消耗正文的「首次」名额', () => {
    // The card comes first in document order, but the prose that follows is
    // still that term's first appearance for a reader reading top to bottom.
    const { html } = run(`::::card
卡片里的:term[立体角]。

:::answer
答案。
:::
::::

正文里的:term[立体角]。`)
    assert.deepEqual(annotations(html, '立体角'), [true, true])
  })

  it('记录使用到的术语，按首次出现排序', () => {
    const { data } = run(':term[立体角] 然后 :term[辐射亮度] 再 :term[立体角]')
    assert.deepEqual(data.terms, ['立体角', '辐射亮度'])
  })

  it('未知术语被记录 (由构建脚本转为致命错误)', () => {
    const { data } = run(':term[不存在的术语]')
    assert.deepEqual(data.unknownTerms, ['不存在的术语'])
  })

  it('空的 :term[] 被记录', () => {
    const { data } = run(':term[]')
    assert.equal(data.unknownTerms?.length, 1)
  })

  it('未知术语不产生 .term 标记', () => {
    const { html } = run(':term[不存在的术语]')
    assert.ok(!html.includes('class="term"'))
  })
})
