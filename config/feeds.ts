/**
 * 每日论文推荐的抓取配置。改这个文件即可，不用动 scripts/fetch-papers.ts。
 *
 * 抓取由 .github/workflows/papers.yml 每天定时跑，结果提交进 data/papers/，
 * 构建时读取。页面本身不请求任何外部 API。
 *
 * 调完可以本地跑 `pnpm papers:dry` 看排序合不合意（不写文件）。
 */

export interface FeedConfig {
  /** arXiv 主分类。命中给 primaryBonus 分，但不保证收录——仍需达到 minScore。 */
  primaryCategories: string[]
  /** arXiv 次要分类。这些分类量大，只有靠关键词得分才可能入选。 */
  secondaryCategories: string[]
  /**
   * 分层关键词（小写匹配）。分层是必要的：把「foveated」和「rendering」
   * 同等对待的话，每天几十篇泛泛的图形学论文会把真正相关的挤下去。
   */
  keywords: {
    /** 直接命中你的方向。一个就足以入选。 */
    core: string[]
    /** 强相关，但需要和别的词一起出现才说明问题。 */
    related: string[]
    /** 只作加权，单独出现说明不了什么。 */
    context: string[]
  }
  weights: {
    core: number
    related: number
    context: number
    /** 出现在标题里的额外加权（标题命中比摘要里提一句强得多）。 */
    titleBonus: number
    /** 属于主分类的基础分。 */
    primaryBonus: number
  }
  /** 低于此分的丢弃。 */
  minScore: number
  /** 命中即丢弃，即使在主分类里。 */
  exclude: string[]
  /** 每次向 arXiv 取多少条（单次上限 2000，但没必要）。 */
  maxResults: number
  /** 每天最多推荐几篇，超出按分数截断。 */
  dailyLimit: number
  /** 归档保留天数，0 = 永久保留。 */
  historyDays: number
}

export const feeds: FeedConfig = {
  primaryCategories: ['cs.GR'],
  // 眼动追踪和感知实验常发在 cs.HC；cs.CV 偶有相关工作。
  // 这两个分类每天几百篇，完全靠关键词筛。
  secondaryCategories: ['cs.CV', 'cs.HC'],

  keywords: {
    // 注视点 / 感知驱动渲染的核心词汇。命中任一即高度相关。
    core: [
      'foveat', // foveated / foveation / fovea
      'gaze-contingent',
      'gaze contingent',
      'peripheral vision',
      'visual acuity',
      'contrast sensitivity',
      'just noticeable difference',
      'psychophysic',
      'eccentricity',
      'saccade',
      'perceptual rendering',
      'perception-driven',
      'visual perception',
    ],

    // 强相关：多半出现在你关心的论文里，但单独出现也可能无关。
    related: [
      'gaze',
      'eye tracking',
      'eye-tracking',
      'visual attention',
      'saliency',
      'perceptually',
      'perceptual quality',
      'near-eye',
      'head-mounted',
      'hmd',
      'virtual reality',
      'augmented reality',
      'variable rate shading',
      'level of detail',
    ],

    // 上下文：只在和上面的词共现时才有意义。
    context: [
      'real-time rendering',
      'neural rendering',
      'upsampling',
      'super-resolution',
      'latency',
      'display',
      'user study',
      'rendering',
    ],
  },

  weights: {
    core: 10,
    related: 3,
    context: 1,
    titleBonus: 5,
    // 刻意给得低：cs.GR 每天十几篇，全给高分的话，
    // 一篇泛泛的图形学论文会压过 cs.HC 里真正相关的注视点研究。
    primaryBonus: 2,
  },

  // 需要至少一个 core（10）、或几个 related 叠加、或主分类 + 一些相关词。
  minScore: 8,

  exclude: [],

  maxResults: 150,
  dailyLimit: 15,
  historyDays: 0,
}
