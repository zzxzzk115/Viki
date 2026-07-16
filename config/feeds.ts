/**
 * 每日论文推荐的抓取配置。改这个文件即可，不用动 scripts/fetch-papers.ts。
 * 调完跑 `pnpm papers:dry` 看排序，不写文件。
 *
 * 抓取由 .github/workflows/papers.yml 每天定时跑，结果提交进 data 分支，
 * 构建时读取。页面本身不请求任何外部 API。
 *
 * ── 结构：按主题分组 ──
 *
 * 推荐按 topics 分主题：每个主题带自己的 arXiv 检索式和归类关键词，
 * 每天的名额按主题配额分（quotaPerTopic），所以发文量大的主题（注视点）
 * 不会把发文量小的主题（图像变形/补全）挤出榜单——此前按总分排，
 * 注视点 11 个 core 词必然霸榜。配额也让高体量查询变安全：
 * abs:inpainting 有 2645 条，但它最多只能占走自己主题的名额。
 *
 * ── 为什么是「主题查询 + 分类扫描」两路 ──
 *
 * 实测：`cat:cs.GR OR cat:cs.CV OR cat:cs.HC` 按时间取最新 150 篇，
 * 里面 cs.CV 有 112 篇、cs.GR 只有 1 篇（0.7%）。合并查询会让小分类饿死；
 * 而单独扫 cs.CV（日均两三百篇）也不可行。所以大分类交给 arXiv 服务端
 * 按主题检索式过滤，只有小的主场分类（cs.GR，日均 5 篇）整个扫。
 *
 * 教训存档（实测过的坑）：
 *   · 缩写有毒：all:RTX 633 条全是提显卡的 ML 论文；VRS/VRCS/DLSS 同理。
 *     用短语（"shading rate"），不用缩写。
 *   · 有些「显然」的说法在 arXiv 上不存在：stereo reprojection、coarse pixel
 *     shading、asynchronous reprojection、temporal antialiasing 全是 0 条。
 *   · 'temporal upsampling' 不能当归类词：视频理解领域同用此短语，
 *     曾把一篇时序动作定位论文顶上经典位。
 */

export interface TopicGroup {
  /** 主题名——与站内论文 tag 词汇一致，页面上直接做筛选 chip。 */
  name: string
  /**
   * 该主题的 arXiv 检索式（不限分类）。语法见 arXiv API 手册：
   *   all:foveated / abs:"gaze-contingent"（短语）/ A AND B
   */
  queries: string[]
  /**
   * 归类关键词（小写匹配 title+abstract）：命中即把论文归入该主题，
   * 同时按 weights.core 计分。一篇可命中多个主题，归入配置顺序里的第一个。
   */
  terms: string[]
}

export interface FeedConfig {
  topics: TopicGroup[]
  /** 整个扫描的分类。只放主场且量小的分类。 */
  sweepCategories: string[]
  /** 每条检索式按时间取多少条。 */
  perTopic: number
  /** 每个扫描分类取多少条。 */
  perSweep: number
  /** 跨主题的强相关词（×weights.related）：单独出现不足以定主题。 */
  related: string[]
  /** 只作加权的上下文词。 */
  context: string[]
  weights: {
    core: number
    related: number
    context: number
    /** 命中标题的额外加权。 */
    titleBonus: number
    /** 来自主题检索式的基础分。 */
    topicBonus: number
    /** 来自分类扫描的基础分。 */
    sweepBonus: number
  }
  /** 低于此分丢弃。 */
  minScore: number
  /** 命中即丢弃。 */
  exclude: string[]
  /** 近期窗口（天）。窗口外的只能走经典通道。 */
  recentDays: number
  /** 每天最多推荐几篇（近期 + 经典合计）。 */
  dailyLimit: number
  /** 每个主题在近期名额里的保底数。剩余名额按总分自由竞争。 */
  quotaPerTopic: number
  /** 归档保留天数，0 = 永久。 */
  historyDays: number
  /** 经典混入：窗口外、高被引、且命中某主题关键词。 */
  classics: {
    /** 每条检索式按 relevance 排序另取多少条（经典的来源）。 */
    perQuery: number
    /** 最低全球被引数（OpenAlex 预印本计数，偏低正常）。 */
    minCitations: number
    /** 每天最多混入几篇。 */
    count: number
  }
}

export const feeds: FeedConfig = {
  topics: [
    {
      name: '注视点渲染',
      queries: [
        'all:foveated',
        'all:foveation',
        'abs:"gaze-contingent"',
        'abs:"peripheral vision"',
        'abs:"visual acuity"',
      ],
      terms: [
        'foveat',
        'gaze-contingent',
        'gaze contingent',
        'peripheral vision',
        'visual acuity',
        'eccentricity',
        'saccade',
      ],
    },
    {
      name: '感知驱动',
      queries: ['abs:"contrast sensitivity"', 'abs:"perceptual rendering"', 'abs:"perception-driven"'],
      terms: [
        'contrast sensitivity',
        'just noticeable difference',
        'psychophysic',
        'perceptual rendering',
        'perception-driven',
        'visual perception',
      ],
    },
    {
      name: '图像变形',
      queries: ['abs:"image warping"', 'abs:"temporal reprojection"', 'abs:"frame extrapolation"'],
      terms: [
        'image warping',
        'depth warping',
        'temporal reprojection',
        'frame extrapolation',
        'disocclusion',
        'timewarp',
      ],
    },
    {
      name: '图像补全',
      queries: ['abs:"video inpainting"', 'abs:"hole filling"'],
      terms: ['video inpainting', 'image inpainting', 'hole filling', 'image completion'],
    },
    {
      name: '光线追踪',
      queries: [
        'all:ReSTIR',
        'all:SVGF',
        'abs:"spatiotemporal variance-guided"',
        'abs:"real-time ray tracing"',
        'abs:"path tracing" AND abs:denoising',
      ],
      terms: ['restir', 'svgf', 'variance-guided', 'reservoir resampling', 'spatiotemporal reservoir'],
    },
    {
      name: '着色',
      queries: ['abs:"shading rate"'],
      terms: ['shading rate', 'variable rate shading', 'visibility buffer'],
    },
  ],

  // 主场：图形学。实测日均 5.2 篇——950 条覆盖整个 recentDays 窗口。
  // 扫出来的论文按 terms 归主题；哪个主题都不沾的走自由名额。
  sweepCategories: ['cs.GR'],

  perTopic: 40,
  perSweep: 950,

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
    'level of detail',
    'path tracing',
    'ray tracing',
    'importance resampling',
    'reservoir',
    'denois', // denoising / denoiser
    'temporal coherence',
    'temporally stable',
    'temporal accumulation',
    'temporal upsampling', // 不能更高：视频理解领域同用此短语
    'reprojection',
    'inpainting',
    'frame interpolation',
    'deferred shading',
    'supersampling',
    'view synthesis',
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
    'gpu',
    'stereo',
    'temporal',
  ],

  weights: {
    core: 10,
    related: 3,
    context: 1,
    titleBonus: 5,
    topicBonus: 6,
    // 刻意低：cs.GR 里泛泛的论文不该压过其他分类里真正对题的。
    sweepBonus: 2,
  },

  minScore: 10,
  exclude: [],
  recentDays: 180,
  dailyLimit: 15,
  // 6 个主题 × 2 保底 = 12 个近期名额全覆盖；有主题没货时名额回流自由竞争。
  quotaPerTopic: 2,
  historyDays: 0,
  classics: {
    perQuery: 25,
    minCitations: 30,
    count: 3,
  },
}
