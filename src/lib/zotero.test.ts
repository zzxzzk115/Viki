import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { zoteroItemRow } from './zotero'

const paper = (data: Record<string, unknown>) => ({ key: 'ABCD1234', data })

describe('zoteroItemRow', () => {
  it('DOI 归一小写、剥 doi.org 前缀', () => {
    const r = zoteroItemRow(
      paper({ itemType: 'journalArticle', title: 'T', DOI: 'https://doi.org/10.1145/ABC.def', date: '2023-05' }),
    )!
    assert.equal(r.doi, '10.1145/abc.def')
    assert.equal(r.year, '2023')
  })

  it('无 DOI 时从 arXiv URL / extra 兜底合成', () => {
    const byUrl = zoteroItemRow(paper({ itemType: 'preprint', title: 'T', url: 'https://arxiv.org/abs/2604.12270v2' }))!
    assert.equal(byUrl.doi, '10.48550/arxiv.2604.12270')
    const byExtra = zoteroItemRow(paper({ itemType: 'preprint', title: 'T', extra: 'arXiv: 2308.04079 [cs.GR]' }))!
    assert.equal(byExtra.doi, '10.48550/arxiv.2308.04079')
  })

  it('note/attachment -> null；缺作者缺日期可容忍', () => {
    assert.equal(zoteroItemRow(paper({ itemType: 'note' })), null)
    assert.equal(zoteroItemRow(paper({ itemType: 'attachment' })), null)
    const r = zoteroItemRow(paper({ itemType: 'book', title: 'B' }))!
    assert.equal(r.creators, '')
    assert.equal(r.year, '')
  })

  it('creators 取姓、最多 3 个', () => {
    const r = zoteroItemRow(
      paper({
        itemType: 'journalArticle',
        title: 'T',
        creators: [{ lastName: 'A' }, { lastName: 'B' }, { name: 'C Institute' }, { lastName: 'D' }],
      }),
    )!
    assert.equal(r.creators, 'A, B, C Institute')
  })
})
