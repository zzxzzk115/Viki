import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  appendBibEntry,
  arxivBibKey,
  bibHasArxivId,
  bibHasDoi,
  buildArxivBibEntry,
  extractBibDois,
  splitBibEntries,
} from './bibtex'

const paper = {
  id: '2510.03964',
  title: 'Enhancing Foveated Rendering with {Weighted} 100% Reservoir & Sampling',
  authors: ['Ada Lovelace', 'Grace Hopper'],
  published: '2025-10-04',
  url: 'https://arxiv.org/abs/2510.03964',
}

describe('buildArxivBibEntry', () => {
  it('生成可被 import-bibtex 解析的条目', () => {
    const e = buildArxivBibEntry(paper)
    assert.match(e, /^@misc\{arxiv2510_03964,/)
    assert.match(e, /author       = \{Ada Lovelace and Grace Hopper\}/)
    assert.match(e, /year         = \{2025\}/)
    assert.match(e, /doi          = \{10\.48550\/arXiv\.2510\.03964\}/)
    assert.match(e, /howpublished = \{arXiv preprint arXiv:2510\.03964\}/)
  })

  it('转义 BibTeX 敏感字符 (花括号剥除、& % 转义)', () => {
    const e = buildArxivBibEntry(paper)
    assert.ok(!/title.*[{}].*Weighted.*[{}]/.test(e.split('\n')[1].slice(20)), '标题内花括号被剥除')
    assert.match(e, /100\\% Reservoir \\& Sampling/)
  })
})

describe('bibHasArxivId', () => {
  it('按 key / doi / eprint 任一识别已存在', () => {
    const e = buildArxivBibEntry(paper)
    assert.ok(bibHasArxivId(e, '2510.03964'))
    assert.ok(!bibHasArxivId(e, '2510.99999'))
  })
})

describe('appendBibEntry', () => {
  it('恰好一个空行分隔，结尾换行', () => {
    const out = appendBibEntry('@misc{a,\n}\n\n\n', '@misc{b,\n}')
    assert.equal(out, '@misc{a,\n}\n\n@misc{b,\n}\n')
  })
})

const BIB = [
  '@article{x1,',
  '  title = {Paper One},',
  '  doi = {10.1145/AAA.111},',
  '}',
  '',
  '@misc{x2,',
  '  title = {Paper Two},',
  '  url = {https://example.com/10.9999/fake-in-url},',
  '  doi = "10.48550/arXiv.2308.04079",',
  '}',
].join('\n')

describe('extractBibDois / bibHasDoi', () => {
  it('按字段提取并归一小写', () => {
    const dois = extractBibDois(BIB)
    assert.ok(dois.has('10.1145/aaa.111'))
    assert.ok(dois.has('10.48550/arxiv.2308.04079'))
    assert.equal(dois.size, 2, 'url 字段里的 DOI 形状不该被当成 doi')
  })

  it('大小写与 doi.org 前缀不影响判断', () => {
    assert.ok(bibHasDoi(BIB, '10.1145/AAA.111'))
    assert.ok(bibHasDoi(BIB, 'https://doi.org/10.1145/aaa.111'))
    assert.ok(!bibHasDoi(BIB, '10.9999/fake-in-url'))
  })
})

describe('splitBibEntries', () => {
  it('按行首 @ 切分，值里的花括号不干扰', () => {
    const entries = splitBibEntries(`% 前言注释\n${BIB}\n\n@book{x3,\n  title = {Has {Braces} Inside},\n}\n`)
    assert.equal(entries.length, 3)
    assert.ok(entries[0].startsWith('@article{x1'))
    assert.ok(entries[2].includes('{Has {Braces} Inside}'))
  })

  it('Zotero 导出含重复 DOI 时，二次去重后恰好追加一条', () => {
    const existing = BIB
    const zoteroExport = [
      '@article{dup,\n  title = {Paper One Again},\n  doi = {10.1145/aaa.111},\n}',
      '@article{fresh,\n  title = {New Paper},\n  doi = {10.5555/new.222},\n}',
    ].join('\n\n')
    const have = extractBibDois(existing)
    const toAdd = splitBibEntries(zoteroExport).filter((e) => {
      const doi = extractBibDois(e)
      return ![...doi].some((d) => have.has(d))
    })
    assert.equal(toAdd.length, 1)
    assert.ok(toAdd[0].includes('New Paper'))
  })
})
