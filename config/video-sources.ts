/**
 * Channel subscriptions for the video discovery feed (scripts/fetch-videos.ts).
 *
 * This is a CURATED LIST, like config/feeds.ts (arXiv topics) and
 * config/reading-sources.ts (news) — you pick who to follow once; videos.yml
 * then pulls their newest uploads into data/videos/latest.json every day (the
 * feed self-updates on the data branch; nothing here needs editing daily).
 *
 * YouTube: give an @handle or a UC… id — the script resolves handles. Bilibili:
 * the numeric space UID (space.bilibili.com/<UID>); fetched via the WBI-signed
 * space API. A dead/renamed channel is skipped and logged, not fatal.
 *
 * Seeded from curated recommendations (github.com/SyMind/awesome-bilibili and
 * well-known 百大 knowledge UP主). Add your own 宝藏博主 freely.
 */

export interface VideoSource {
  category: string
  platform: 'youtube' | 'bilibili'
  /** YouTube: @handle or UC… id. Bilibili: numeric space UID. */
  channel: string
  limit: number
}

export const videoSources: VideoSource[] = [
  // 图形学
  { category: '图形学', platform: 'youtube', channel: '@TwoMinutePapers', limit: 2 },
  { category: '图形学', platform: 'youtube', channel: '@Acerola_t', limit: 2 },
  { category: '图形学', platform: 'bilibili', channel: '512313464', limit: 2 }, // GAMES-Webinar

  // 引擎 / 游戏开发
  { category: '引擎', platform: 'youtube', channel: '@TheCherno', limit: 2 },
  { category: '引擎', platform: 'bilibili', channel: '437860379', limit: 2 }, // 原子之音（C++/游戏）

  // CS / 算法 / AI
  { category: 'CS', platform: 'youtube', channel: '@Computerphile', limit: 2 },
  { category: 'CS', platform: 'youtube', channel: '@javidx9', limit: 2 },
  { category: 'CS', platform: 'bilibili', channel: '1567748478', limit: 2 }, // 跟李沐学AI
  { category: 'CS', platform: 'bilibili', channel: '202224425', limit: 2 }, // 绿导师原谅你了（OS）

  // 金融
  { category: '金融', platform: 'youtube', channel: '@ThePlainBagel', limit: 2 },
  { category: '金融', platform: 'bilibili', channel: '520819684', limit: 2 }, // 小Lin说

  // 历史
  { category: '历史', platform: 'youtube', channel: '@CrashCourse', limit: 2 },
  { category: '历史', platform: 'youtube', channel: '@HistoriaCivilis', limit: 2 },
  { category: '历史', platform: 'bilibili', channel: '11646119', limit: 2 }, // 正直讲史
  { category: '历史', platform: 'bilibili', channel: '23947287', limit: 2 }, // 小约翰可汗（世界史/地缘）

  // 英语学习
  { category: '英语', platform: 'youtube', channel: '@bbclearningenglish', limit: 2 },
  { category: '英语', platform: 'youtube', channel: '@EnglishwithLucy', limit: 2 },
]
