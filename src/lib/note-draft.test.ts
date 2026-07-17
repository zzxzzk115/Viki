import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildDraftRequest, parseDraftResponse, validateDraftPath } from './note-draft'

const SUBJECTS = ['math', 'cs', 'engine', 'music']

const GOOD = [
  '```yaml',
  'path: content/cs/algorithms/quick-sort.md',
  'title: 快速排序',
  'tags: [算法, 排序]',
  'level: basic',
  'summary: 分治 + 原地分区。',
  '```',
  '',
  '```markdown',
  '---',
  'title: 快速排序',
  'level: basic',
  'tags: [算法, 排序]',
  'summary: 分治 + 原地分区。',
  '---',
  '',
  '正文……',
  '```',
].join('\n')

describe('buildDraftRequest', () => {
  it('系统提示包含写作规范与双块输出约束', () => {
    const r = buildDraftRequest([{ role: 'user', content: 'q' }], SUBJECTS, ['辐射亮度'])
    assert.ok(r.system.includes('::::card') && r.system.includes(':::quiz'))
    assert.ok(r.system.includes('```yaml') && r.system.includes('```markdown'))
    assert.ok(r.system.includes('math / cs / engine / music'))
    assert.ok(r.system.includes('辐射亮度'))
    assert.equal(r.messages.at(-1)?.role, 'user')
  })
})

describe('validateDraftPath', () => {
  it('合法路径通过', () => {
    assert.equal(validateDraftPath('content/cs/algorithms/quick-sort.md', SUBJECTS), null)
  })
  it('越界与坏形状被拒', () => {
    assert.ok(validateDraftPath('content/../secrets.md', SUBJECTS))
    assert.ok(validateDraftPath('scratch/x.md', SUBJECTS))
    assert.ok(validateDraftPath('content/unknown/x/y.md', SUBJECTS))
    assert.ok(validateDraftPath('content/cs/NoKebab.md', SUBJECTS))
    assert.ok(validateDraftPath('content/cs/a.txt', SUBJECTS))
  })
})

describe('parseDraftResponse', () => {
  it('合法双块解析成功', () => {
    const r = parseDraftResponse(GOOD, SUBJECTS)
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.proposal.path, 'content/cs/algorithms/quick-sort.md')
    assert.equal(r.proposal.title, '快速排序')
    assert.deepEqual(r.proposal.tags, ['算法', '排序'])
    assert.equal(r.proposal.level, 'basic')
    assert.ok(r.markdown.startsWith('---'))
  })

  it('缺块 / 坏路径 / 缺 frontmatter -> 拒绝', () => {
    assert.ok(!parseDraftResponse('没有代码块', SUBJECTS).ok)
    assert.ok(!parseDraftResponse(GOOD.replace('content/cs', 'content/nope'), SUBJECTS).ok)
    const noFm = GOOD.replace(/```markdown[\s\S]*```/, '```markdown\n没有 frontmatter\n```')
    assert.ok(!parseDraftResponse(noFm, SUBJECTS).ok)
  })
})
