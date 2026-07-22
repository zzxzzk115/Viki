/**
 * Channel subscriptions for the video discovery feed (scripts/fetch-videos.ts).
 *
 * YouTube is the backbone: channel RSS (feeds/videos.xml?channel_id=UC…) needs
 * no key and is reliable. Give a channel by its @handle OR its UC… id — the
 * script resolves handles by reading the channel page. Bilibili has no official
 * RSS, so its auto-discovery is best-effort via RSSHub (non-fatal); Bilibili is
 * fully supported for MANUAL 收藏.
 *
 * Edit freely — a dead/renamed channel is just skipped and logged. Fill in your
 * own finance/history UP主 & YouTubers under the matching category.
 */

export interface VideoSource {
  /** Domain label shown as the category chip. */
  category: string
  platform: 'youtube' | 'bilibili'
  /** YouTube: @handle or UC… id. Bilibili: numeric UID. */
  channel: string
  /** Max recent uploads to take per run. */
  limit: number
}

export const videoSources: VideoSource[] = [
  // 图形学 / 引擎 / CS —— 起步频道（我确信存在的 handle；按需增删）
  { category: '图形学', platform: 'youtube', channel: '@TwoMinutePapers', limit: 3 },
  { category: '图形学', platform: 'youtube', channel: '@Acerola_t', limit: 3 },
  { category: '引擎', platform: 'youtube', channel: '@TheCherno', limit: 3 },
  { category: 'CS', platform: 'youtube', channel: '@javidx9', limit: 3 },

  // 金融 / 历史 / 英语 —— 关键词见 config 注释，填你常看的频道：
  // { category: '金融', platform: 'youtube', channel: '@…', limit: 3 },
  // { category: '历史', platform: 'youtube', channel: '@…', limit: 3 },
  // { category: '英语', platform: 'youtube', channel: '@…', limit: 3 },
  // { category: '图形学', platform: 'bilibili', channel: '<UID>', limit: 3 }, // 手动收藏更稳
]
