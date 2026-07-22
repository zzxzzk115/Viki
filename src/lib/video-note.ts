/**
 * Video URL parsing + video-note scaffolding, pure so the collect flow and the
 * discovery feed both build identical notes without the network.
 */

export type VideoPlatform = 'youtube' | 'bilibili'
export interface VideoRef {
  platform: VideoPlatform
  /** YouTube 11-char id, or Bilibili BV id. */
  id: string
}

/** Recognizes the common YouTube and Bilibili URL shapes; null otherwise. */
export function parseVideoUrl(url: string): VideoRef | null {
  const u = url.trim()
  // youtu.be/<id>, youtube.com/watch?v=<id>, /shorts/<id>, /embed/<id>
  const yt =
    u.match(/(?:youtube\.com\/(?:watch\?[^#]*\bv=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/)?.[1]
  if (yt) return { platform: 'youtube', id: yt }
  // bilibili.com/video/BV..., or a bare BV id
  const bv = u.match(/(BV[0-9A-Za-z]{10})/)?.[1]
  if (bv) return { platform: 'bilibili', id: bv }
  return null
}

/** Canonical watch URL for a ref. */
export function videoUrl(ref: VideoRef): string {
  return ref.platform === 'youtube'
    ? `https://www.youtube.com/watch?v=${ref.id}`
    : `https://www.bilibili.com/video/${ref.id}`
}

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'and', 'for', 'with', 'is', 'how', 'why'])

/** kebab slug from the title, capped; falls back to the video id. */
export function videoSlug(title: string, id: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^\w\s一-鿿]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .slice(0, 6)
    .join('-')
    .replace(/^-+|-+$/g, '')
  return s || id.toLowerCase()
}

export interface VideoNoteInput {
  platform: VideoPlatform
  id: string
  title: string
  channel?: string
  category?: string
  tags?: string[]
}

/** A one-video note: frontmatter carries the embed; body is yours to write. */
export function buildVideoNote(v: VideoNoteInput): string {
  const yaml = (s: string) => `"${s.replace(/"/g, '\\"')}"`
  const tags = [...new Set(['视频', ...(v.category ? [v.category] : []), ...(v.tags ?? [])])]
  const lines = [
    '---',
    `title: ${yaml(v.title)}`,
    'level: basic',
    `tags: [${tags.map(yaml).join(', ')}]`,
    `video: { platform: ${v.platform}, id: ${yaml(v.id)}${v.channel ? `, channel: ${yaml(v.channel)}` : ''} }`,
    '---',
    '',
    v.channel ? `> 频道：${v.channel}` : '',
    '',
    '## 笔记',
    '',
    '（在这里写你的笔记。可以用 `@12:34` 标时间戳跳转，写 `::::card` 把要点提炼成卡片。）',
    '',
  ]
  return lines.filter((l, i) => !(l === '' && lines[i - 1] === '')).join('\n')
}
