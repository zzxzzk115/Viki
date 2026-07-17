import type { ChatMessage } from './ai'

/**
 * AI chat → note draft, pure parts. The trust boundary lives here as much as
 * in the UI: the model only ever PROPOSES {path, meta, markdown}; every
 * proposal passes validateDraftPath (the editor's own whitelist shape) and a
 * human edits/confirms before anything touches the repo.
 */

export interface DraftProposal {
  path: string
  title: string
  tags: string[]
  level: 'basic' | 'intermediate' | 'advanced'
  summary: string
}

export function buildChatSystem(subjects: string[]): string {
  return [
    '你是 Viki——一个中文个人知识库的学习助手，擅长数学、物理、计算机图形学、游戏引擎与音乐。',
    '回答要准确、结构清晰；专业术语首次出现标注英文；公式用 $...$ / $$...$$。不确定的内容明确说不确定。',
    `知识库现有科目：${subjects.join('、')}。`,
    '当一次回答完整覆盖了一个值得沉淀的知识点时，在结尾用一句话提醒用户可以点「生成笔记草稿」把它存进知识库。',
  ].join('\n')
}

/**
 * Second-stage request: turn the conversation into a full note draft plus a
 * placement proposal. The site's authoring conventions are compressed into
 * the system prompt so the draft builds cleanly.
 */
export function buildDraftRequest(
  conversation: ChatMessage[],
  subjects: string[],
  glossaryKeys: string[],
): { system: string; messages: ChatMessage[] } {
  const system = [
    '把对话里讨论的知识点整理成一篇知识库笔记。写作规范（构建会强制校验，违反会失败）：',
    `1. 文件路径形如 content/<科目>/<子目录>/<kebab-slug>.md，科目必须是：${subjects.join(' / ')}。`,
    '2. frontmatter 字段：title（必填）、level（basic|intermediate|advanced）、tags（2-4 个中文）、summary（一句话）。',
    `3. 术语标注 :term[词] 只能用于术语表里已有的词：${glossaryKeys.slice(0, 80).join('、')}${glossaryKeys.length > 80 ? '…' : ''}。表里没有的词不要用 :term，直接在括号里标英文。`,
    '4. 关键结论用 **加粗**（刷题模式会挖空加粗关键词）。',
    '5. 至少一张知识卡片，语法（外层四冒号、内层三冒号，:::quiz 恰好 4 项、1 个 ✓）：',
    '::::card\n问题？\n\n:::answer\n答案。\n:::\n\n:::quiz\n- ✓ 正确项\n- 干扰 1\n- 干扰 2\n- 干扰 3\n:::\n::::',
    '6. 一篇只讲一个主题；不确定的内容标「（待核对）」。',
    '',
    '输出恰好两个围栏代码块，此外不要任何文字：',
    '第一个 ```yaml 块：path / title / tags（行内数组）/ level / summary 五个字段。',
    '第二个 ```markdown 块：完整笔记（含 frontmatter）。',
  ].join('\n')

  return {
    system,
    messages: [
      ...conversation,
      { role: 'user', content: '请把上面讨论的知识点整理成笔记草稿，按规范输出两个代码块。' },
    ],
  }
}

const PATH_RE = /^content\/[\w-]+(\/[\w-]+)*\/[a-z0-9]+(-[a-z0-9]+)*\.md$/

export function validateDraftPath(path: string, subjects: string[]): string | null {
  if (path.includes('..')) return '路径不能包含 ..'
  if (!PATH_RE.test(path)) return '路径必须形如 content/<科目>/<子目录>/<kebab-slug>.md'
  const subject = path.split('/')[1]
  if (!subjects.includes(subject)) return `科目 "${subject}" 不存在（现有：${subjects.join('、')}）`
  return null
}

export function parseDraftResponse(
  text: string,
  subjects: string[],
): { ok: true; proposal: DraftProposal; markdown: string } | { ok: false; message: string } {
  const yamlBlock = text.match(/```(?:yaml|yml)\r?\n([\s\S]*?)```/)?.[1]
  const mdBlock = text.match(/```(?:markdown|md)\r?\n([\s\S]*?)```/)?.[1]
  if (!yamlBlock) return { ok: false, message: 'AI 输出缺少 ```yaml 提案块' }
  if (!mdBlock) return { ok: false, message: 'AI 输出缺少 ```markdown 笔记块' }

  const line = (key: string) => yamlBlock.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim()
  const unquote = (s: string | undefined) => s?.replace(/^['"]/, '').replace(/['"]$/, '').trim() ?? ''

  const path = unquote(line('path'))
  const pathError = validateDraftPath(path, subjects)
  if (pathError) return { ok: false, message: pathError }

  const title = unquote(line('title'))
  if (!title) return { ok: false, message: '提案缺少 title' }

  const levelRaw = unquote(line('level'))
  const level = (['basic', 'intermediate', 'advanced'] as const).find((l) => l === levelRaw) ?? 'basic'

  const tags = (line('tags')?.match(/\[([^\]]*)\]/)?.[1] ?? '')
    .split(',')
    .map((t) => unquote(t.trim()))
    .filter(Boolean)

  const markdown = mdBlock.trim()
  if (!/^---\r?\n[\s\S]*?\r?\n---/.test(markdown)) {
    return { ok: false, message: '笔记块缺少 frontmatter' }
  }

  return {
    ok: true,
    proposal: { path, title, tags, level, summary: unquote(line('summary')) },
    markdown: `${markdown}\n`,
  }
}
