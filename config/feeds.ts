/**
 * 每日论文推荐的抓取配置。改这个文件即可，不用动 scripts/fetch-papers.ts。
 * 调完跑 `pnpm papers:dry` 看排序，不写文件。
 *
 * 抓取由 .github/workflows/papers.yml 每天定时跑，结果提交进 data/papers/，
 * 构建时读取。页面本身不请求任何外部 API。
 *
 * ── 为什么是「主题查询 + 分类扫描」两路 ──
 *
 * 实测：`cat:cs.GR OR cat:cs.CV OR cat:cs.HC` 按时间取最新 150 篇，
 * 里面 cs.CV 有 112 篇、cs.GR 只有 1 篇（0.7%），且只覆盖 28 小时。
 * 合并查询会让小分类被彻底饿死。
 *
 * 而单独扫 cs.CV 也不可行：它每天两三百篇，要捞出里面的注视点论文
 * 得取几千条。所以大分类交给 arXiv 服务端按关键词过滤（topicQueries），
 * 只有小的主场分类才整个扫（sweepCategories）。
 */

export interface FeedConfig {
  /**
   * arXiv 检索式，**不限分类**——你方向的论文发在 cs.CV、cs.HC、eess.IV
   * 都有可能，按分类找会漏。语法见 arXiv API 手册：
   *   all:foveated              标题/摘要/作者等全字段
   *   abs:"gaze-contingent"     只搜摘要，带引号是短语
   *   ti:foveated               只搜标题
   */
  topicQueries: string[]
  /**
   * 整个扫描的分类。只放你的主场、且量小的分类。
   * cs.GR 每天约 4 篇，取 60 条覆盖两周。
   */
  sweepCategories: string[]
  /** 每个主题查询取多少条。 */
  perTopic: number
  /** 每个扫描分类取多少条。 */
  perSweep: number

  /**
   * 分层关键词（小写匹配 title + abstract），用于打分。
   * 分层是必要的：把 foveated 和 rendering 同等对待的话，
   * 泛泛的图形学论文会把真正相关的挤下去。
   */
  keywords: {
    /** 直接命中你的方向，一个就足以入选。 */
    core: string[]
    /** 强相关，但需与其他词共现才说明问题。 */
    related: string[]
    /** 只作加权，单独出现说明不了什么。 */
    context: string[]
  }
  weights: {
    core: number
    related: number
    context: number
    /** 命中标题的额外加权——标题里出现比摘要里提一句强得多。 */
    titleBonus: number
    /** 来自 topicQueries 的基础分：arXiv 服务端已经判定它相关了。 */
    topicBonus: number
    /** 属于 sweepCategories 的基础分。 */
    sweepBonus: number
  }
  /** 低于此分丢弃。 */
  minScore: number
  /** 命中即丢弃。 */
  exclude: string[]
  /**
   * 只考虑最近多少天发表的论文。
   *
   * 这个字段的存在是因为一个实测事实：arXiv 上 foveated 相关总共约 163 篇，
   * 你的方向每月新增只有几篇。如果只推「今天新增的」，页面绝大多数日子是空的；
   * 如果不限时间，又会一直推 2019 年的老论文。
   * 所以 feed 是「近期相关论文排行」，首次出现的会打「新」标。
   */
  recentDays: number
  /** 每天最多推荐几篇，超出按分数截断。 */
  dailyLimit: number
  /** 归档保留天数，0 = 永久保留。 */
  historyDays: number
}

export const feeds: FeedConfig = {
  // 注视点 / 感知驱动渲染。这些是「无论发在哪个分类都要」的。
  topicQueries: [
    'all:foveated',
    'all:foveation',
    'abs:"gaze-contingent"',
    'abs:"peripheral vision"',
    'abs:"visual acuity"',
    'abs:"contrast sensitivity"',
    'abs:"perceptual rendering"',
    'abs:"perception-driven"',
    'abs:"eye tracking" AND cat:cs.GR',
    'abs:"variable rate shading"',
  ],

  // 主场：图形学。每天约 4 篇，全部过一遍。
  sweepCategories: ['cs.GR'],

  perTopic: 40,
  perSweep: 60,

  keywords: {
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
    // arXiv 服务端已经判定它匹配了主题检索式，给个起步分。
    topicBonus: 6,
    // 刻意给得低：cs.GR 里一篇泛泛的论文不该压过 cs.HC 里真正的注视点研究。
    sweepBonus: 2,
  },

  minScore: 10,
  exclude: [],
  // 半年。注视点方向大约每月几篇，半年的窗口能凑出一页有内容的排行，
  // 又不至于推到三年前的东西。
  recentDays: 180,
  dailyLimit: 15,
  historyDays: 0,
}
