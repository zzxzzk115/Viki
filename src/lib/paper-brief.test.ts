import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AI_DRAFT_MARKER, buildBriefPrompt, mergeBrief, parseBriefMeta } from './paper-brief'

const INPUT = {
  title: 'Foveated 3D Graphics',
  authors: ['Brian Guenter', 'Mark Finch'],
  venue: 'SIGGRAPH Asia 2012',
  year: 2012,
  abstract: 'We exploit the falloff of acuity in the visual periphery...',
}

// Shape emitted by import-bibtex.ts for a to-read placeholder.
const PLACEHOLDER = `---
title: "DreamStereo: Real-Time Stereo Synthesis"
authors: ["Alice Chen", "Bob Liu"]
venue: arXiv 2026
venueType: preprint
year: 2026
doi: "10.48550/arXiv.2604.12270"
tags: [立体视觉]
status: to-read
---

<!-- 从 BibTeX 导入的占位页，读完后补全以下内容 -->

## 贡献

## 方法

## 我的评价
`

describe('buildBriefPrompt', () => {
  it('材料齐全：含元数据、摘要与两节约束', () => {
    const p = buildBriefPrompt(INPUT)
    assert.ok(p.messages[0].content.includes('Foveated 3D Graphics'))
    assert.ok(p.messages[0].content.includes('acuity in the visual periphery'))
    assert.ok(p.system.includes('## 贡献') && p.system.includes('## 方法'))
    assert.ok(p.system.includes('不要输出 frontmatter'))
  })

  it('无摘要时加重 hedge', () => {
    const p = buildBriefPrompt({ ...INPUT, abstract: null })
    assert.ok(p.system.includes('没有摘要'))
    assert.ok(p.messages[0].content.includes('（无摘要）'))
  })
})

describe('parseBriefMeta', () => {
  it('解析 import-bibtex 生成的 frontmatter（引号标题、行内作者数组、doi）', () => {
    const m = parseBriefMeta(PLACEHOLDER)!
    assert.equal(m.title, 'DreamStereo: Real-Time Stereo Synthesis')
    assert.deepEqual(m.authors, ['Alice Chen', 'Bob Liu'])
    assert.equal(m.venue, 'arXiv 2026')
    assert.equal(m.year, 2026)
    assert.equal(m.doi, '10.48550/arXiv.2604.12270')
  })

  it('块状作者列表也能解析', () => {
    const md = `---\ntitle: X\nauthors:\n  - Alice\n  - Bob\nvenue: V\nyear: 2020\n---\nbody`
    assert.deepEqual(parseBriefMeta(md)!.authors, ['Alice', 'Bob'])
  })

  it('非论文 md（无 frontmatter / 无 title）-> null', () => {
    assert.equal(parseBriefMeta('# 只是普通笔记'), null)
    assert.equal(parseBriefMeta('---\ntags: [x]\n---\n'), null)
  })
})

describe('mergeBrief', () => {
  const BRIEF = `## 贡献\n\n1. 第一条贡献\n2. 第二条\n\n## 方法\n\n- 要点甲\n- 要点乙`

  it('填入空节：frontmatter 逐字节不变、评价与导入注释不动、含标记', () => {
    const r = mergeBrief(PLACEHOLDER, BRIEF)
    assert.ok(r.ok)
    if (!r.ok) return
    const fm = PLACEHOLDER.match(/^---[\s\S]*?---\n/)![0]
    assert.ok(r.text.startsWith(fm), 'frontmatter 变了')
    assert.ok(r.text.includes('<!-- 从 BibTeX 导入的占位页'), '导入注释丢失')
    assert.ok(r.text.includes(AI_DRAFT_MARKER))
    assert.ok(r.text.includes('第一条贡献') && r.text.includes('要点甲'))
    assert.ok(/## 我的评价\s*$/.test(r.text), '评价节应保持为空')
  })

  it('重跑幂等：替换标记块而非叠加', () => {
    const once = mergeBrief(PLACEHOLDER, BRIEF)
    assert.ok(once.ok)
    if (!once.ok) return
    const twice = mergeBrief(once.text, '## 贡献\n\n1. 新版本\n\n## 方法\n\n- 新要点')
    assert.ok(twice.ok)
    if (!twice.ok) return
    assert.ok(!twice.text.includes('第一条贡献'), '旧草稿没被替换')
    assert.equal(twice.text.split(AI_DRAFT_MARKER).length - 1, 2, '标记应恰好 2 处（每节 1 处）')
  })

  it('有人工内容 -> 拒绝', () => {
    const withHuman = PLACEHOLDER.replace('## 贡献\n', '## 贡献\n\n我自己写的分析。\n')
    const r = mergeBrief(withHuman, BRIEF)
    assert.ok(!r.ok && r.message.includes('不覆盖'))
  })

  it('AI 输出缺节 -> 拒绝', () => {
    const r = mergeBrief(PLACEHOLDER, '## 贡献\n\n只有一节')
    assert.ok(!r.ok)
  })

  it('目标缺少小节 -> 拒绝', () => {
    const r = mergeBrief('---\ntitle: x\n---\n\n正文没有小节', BRIEF)
    assert.ok(!r.ok)
  })

  it('含 $ 的公式内容不破坏替换', () => {
    const r = mergeBrief(PLACEHOLDER, '## 贡献\n\n1. $O(n)$ 与 $x^2$\n\n## 方法\n\n- $E = mc^2$')
    assert.ok(r.ok)
    if (!r.ok) return
    assert.ok(r.text.includes('$O(n)$') && r.text.includes('$E = mc^2$'))
  })
})
