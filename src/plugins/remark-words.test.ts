import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import rehypeStringify from 'rehype-stringify'
import remarkDirective from 'remark-directive'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import type { RawWord } from './remark-words'
import { remarkWords } from './remark-words'

function parse(md: string): { words: RawWord[]; errors: string[]; html: string } {
  const file = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkWords)
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync(md)
  return { words: file.data.words ?? [], errors: file.data.wordErrors ?? [], html: String(file) }
}

const WORD = `::::word{ipa="/əˈbændən/" pos=v}
abandon

:::meaning
放弃，抛弃
:::

:::example
He abandoned his car in the snow.
:::
::::`

describe('remarkWords', () => {
  it('提取单词 + ipa/pos 属性 + meaning/example', () => {
    const { words, errors } = parse(WORD)
    assert.equal(errors.length, 0)
    assert.equal(words.length, 1)
    assert.equal(words[0].word, 'abandon')
    assert.equal(words[0].ipa, '/əˈbændən/')
    assert.equal(words[0].pos, 'v')
    assert.ok(words[0].example)
  })

  it('example 可选', () => {
    const { words, errors } = parse('::::word\nhello\n\n:::meaning\n你好\n:::\n::::')
    assert.equal(errors.length, 0)
    assert.equal(words[0].word, 'hello')
    assert.equal(words[0].example, undefined)
  })

  it('缺 :::meaning -> 记录错误、不产出', () => {
    const { words, errors } = parse('::::word\nhello\n::::')
    assert.equal(words.length, 0)
    assert.ok(errors[0].includes('meaning'))
  })

  it('缺单词 -> 记录错误', () => {
    const { errors } = parse('::::word\n\n:::meaning\n你好\n:::\n::::')
    assert.ok(errors.some((e) => e.includes('单词')))
  })

  it('渲染为 vocab-card（内联可见）', () => {
    const { html } = parse(WORD)
    assert.ok(html.includes('vocab-card'))
    assert.ok(html.includes('abandon'))
  })
})
