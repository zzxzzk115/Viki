import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { appendBibEntry, arxivBibKey, bibHasArxivId, buildArxivBibEntry } from './bibtex'

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
