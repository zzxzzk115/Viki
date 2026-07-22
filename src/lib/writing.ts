import type { ChatMessage } from './ai'

/**
 * Writing practice: a curated prompt bank + the AI-grading prompt builder.
 * Pure so the prompt shapes are unit-tested; the grading itself runs through
 * the same chat() the sidebar uses, against the user's configured provider.
 */

export type WritingMode = 'ielts' | 'academic'

export interface WritingPrompt {
  id: string
  mode: WritingMode
  /** Short label for the picker. */
  title: string
  /** The full task shown to the writer. */
  prompt: string
  minWords: number
}

export const WRITING_PROMPTS: WritingPrompt[] = [
  // --- IELTS Task 2 (250+ words) ---
  {
    id: 'ielts-arts-funding',
    mode: 'ielts',
    title: '公共服务 vs 艺术',
    prompt:
      'Some people believe that governments should spend money on public services such as healthcare and education rather than on the arts. To what extent do you agree or disagree?',
    minWords: 250,
  },
  {
    id: 'ielts-social-media',
    mode: 'ielts',
    title: '社交媒体的影响',
    prompt:
      'Many people believe that social media has a mostly negative effect on society, while others disagree. Discuss both views and give your own opinion.',
    minWords: 250,
  },
  {
    id: 'ielts-remote-work',
    mode: 'ielts',
    title: '远程办公',
    prompt:
      'More companies are allowing employees to work from home. Do the advantages of this trend outweigh the disadvantages?',
    minWords: 250,
  },
  {
    id: 'ielts-ai-jobs',
    mode: 'ielts',
    title: 'AI 与就业',
    prompt:
      'As artificial intelligence automates more tasks, some argue it will create widespread unemployment, while others believe it will create new kinds of jobs. Discuss both views and give your own opinion.',
    minWords: 250,
  },
  // --- Academic writing ---
  {
    id: 'acad-abstract',
    mode: 'academic',
    title: '写一段摘要',
    prompt:
      '为你正在做/感兴趣的一个研究写一段结构化摘要（≈150 词）：背景与问题 → 方法 → 主要结果 → 结论/意义。用客观、正式的学术英语。',
    minWords: 120,
  },
  {
    id: 'acad-intro-gap',
    mode: 'academic',
    title: '引言：研究空白',
    prompt:
      '写一段论文引言：先概述该领域已有工作，再点明其局限（研究空白 research gap），最后一句陈述你的贡献。用「Although … , little work has …」这类学术衔接。',
    minWords: 120,
  },
  {
    id: 'acad-rewrite',
    mode: 'academic',
    title: '口语改学术体',
    prompt:
      '把下面这段口语化文字改写成正式学术英语（注意 hedging、被动/名词化、客观性）：“We tried a bunch of stuff and it worked way better than the old way. Basically our method is just faster and people liked it.”',
    minWords: 60,
  },
]

/** English word count (whitespace-delimited); fine for essays. */
export function countWords(s: string): number {
  const t = s.trim()
  return t ? t.split(/\s+/).length : 0
}

const IELTS_SYSTEM = [
  '你是经验丰富的雅思写作考官。请按官方四项评分标准评估这篇 Task 2 作文：',
  '任务回应（Task Response）、连贯与衔接（Coherence & Cohesion）、词汇资源（Lexical Resource）、语法多样性与准确性（Grammatical Range & Accuracy）。',
  '输出 markdown，包含：',
  '1. **总评估**：预估总分段（band 5.0–9.0）+ 一句话总结。',
  '2. **四项逐条**：每项一小段，给分段 + 具体优点/问题（引用原文片段）。',
  '3. **具体修改**：列 3–6 条最值得改的地方，每条「原句 → 改法」。',
  '4. **改写示范**：挑一段（如引言或一个主体段）给出更高分的改写。',
  '点评用简体中文，保留英文术语与被引用的英文原句。诚实、具体，不要空泛夸奖。',
].join('\n')

const ACADEMIC_SYSTEM = [
  '你是学术论文写作导师。评估下面这段学术写作，维度：结构与逻辑、论证清晰度、学术语体（hedging、signposting、客观性、名词化）、语法与用词准确性。',
  '输出 markdown，包含：',
  '1. **总评**：一句话，这段写作在学术语体上最突出的优点与最大问题。',
  '2. **逐维度**：每个维度一小段，引用原文指出问题。',
  '3. **具体修改**：3–6 条「原句 → 改法」，强调学术化（避免口语、加 hedging、被动/名词化）。',
  '4. **改写示范**：给出整段更学术的改写。',
  '用简体中文点评，保留被引用的英文原句。',
].join('\n')

export function buildFeedbackPrompt(p: WritingPrompt, essay: string): { system: string; messages: ChatMessage[] } {
  const system = p.mode === 'ielts' ? IELTS_SYSTEM : ACADEMIC_SYSTEM
  const user = [`题目：\n${p.prompt}`, '', `我的写作（${countWords(essay)} 词）：`, essay].join('\n')
  return { system, messages: [{ role: 'user', content: user }] }
}
