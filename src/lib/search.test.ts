import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createIndex, loadIndex, tokenize, type SearchDoc } from './search'

const doc = (over: Partial<SearchDoc>): SearchDoc => ({
  id: 'x',
  title: '',
  subject: 'physics',
  level: 'basic',
  tags: [],
  summary: '',
  text: '',
  href: '/notes/x/',
  kind: 'note',
  ...over,
})

const docs: SearchDoc[] = [
  doc({
    id: 'radiometry',
    title: '辐射度量学基础',
    tags: ['光学', '渲染'],
    summary: '辐射通量、辐照度、辐射亮度的区别',
    // The English arrives via the glossary, appended by build-content.
    text: '辐射亮度沿真空中的光线传播不变，这是光线追踪成立的前提 radiance irradiance solid angle 亮度',
  }),
  doc({
    id: 'svd',
    title: '奇异值分解',
    subject: 'math',
    tags: ['线性代数'],
    text: '任何矩阵都能拆成旋转缩放旋转 singular value decomposition SVD',
  }),
  doc({
    id: 'foveated',
    title: 'Foveated 3D Graphics',
    kind: 'paper',
    tags: ['注视点渲染', 'SIGGRAPH Asia', '2012'],
    text: '视锐度随离心率衰减 foveated rendering minimum angle of resolution MAR',
    href: '/papers/foveated/',
  }),
]

const index = createIndex(docs)
const find = (q: string) => index.search(q).map((r) => r.id)

describe('tokenize', () => {
  it('切开中文 —— minisearch 默认分词会把整句当成一个 token', () => {
    const toks = tokenize('辐射亮度沿真空中的光线传播不变')
    assert.ok(toks.length > 5, `期望多个 token，实际 ${toks.length}: ${toks}`)
    assert.ok(toks.includes('辐射'))
    assert.ok(toks.includes('光线'))
  })

  it('保留英文单词', () => {
    assert.deepEqual(tokenize('foveated rendering'), ['foveated', 'rendering'])
  })

  it('丢弃标点和空白', () => {
    assert.deepEqual(tokenize('a, b。 c'), ['a', 'b', 'c'])
  })
})

describe('search', () => {
  it('中文词能搜到', () => {
    assert.deepEqual(find('辐射亮度'), ['radiometry'])
  })

  it('中文子串能搜到 (分词后仍是词)', () => {
    assert.ok(find('光线').includes('radiometry'))
  })

  it('英文能搜到中文笔记 —— 靠术语表把英文拼进了搜索文本', () => {
    assert.ok(find('radiance').includes('radiometry'))
  })

  it('缩写能搜到中文笔记', () => {
    assert.ok(find('SVD').includes('svd'))
  })

  it('缩写大小写不敏感', () => {
    assert.ok(find('svd').includes('svd'))
  })

  it('标题命中排在正文命中前面', () => {
    const r = index.search('奇异值分解')
    assert.equal(r[0]?.id, 'svd')
  })

  it('标签能搜到', () => {
    assert.ok(find('线性代数').includes('svd'))
  })

  it('论文按会议搜', () => {
    assert.ok(find('SIGGRAPH').includes('foveated'))
  })

  it('无关词搜不到', () => {
    assert.deepEqual(find('量子色动力学'), [])
  })
})

describe('序列化', () => {
  it('loadIndex 还原后结果与原索引一致 —— 分词器必须两边相同', () => {
    // The real failure this guards: tokenize is a function and cannot be
    // serialized. If loadIndex forgets to re-supply it, minisearch falls back
    // to the default tokenizer and every Chinese query silently returns nothing.
    const restored = loadIndex(JSON.stringify(index))
    for (const q of ['辐射亮度', '光线追踪', 'radiance', 'SVD', '奇异值分解']) {
      assert.deepEqual(
        restored.search(q).map((r) => r.id),
        index.search(q).map((r) => r.id),
        `"${q}" 在还原后的索引上结果不同`,
      )
    }
  })

  it('还原后的中文搜索非空 (回归: 默认分词器会让它全空)', () => {
    const restored = loadIndex(JSON.stringify(index))
    assert.ok(restored.search('辐射亮度').length > 0)
  })
})
