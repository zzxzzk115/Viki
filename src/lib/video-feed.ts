import { z } from 'zod'

/** One discovered video, as written to data/videos/latest.json. */
export const VideoItem = z.object({
  id: z.string(),
  platform: z.enum(['youtube', 'bilibili']),
  videoId: z.string(),
  title: z.string(),
  channel: z.string().default(''),
  url: z.string(),
  thumb: z.string().default(''),
  published: z.string().default(''),
  /** Domain label from config/video-sources.ts (图形学 / 引擎 / …). */
  category: z.string().default(''),
})
export type VideoItem = z.infer<typeof VideoItem>

export const VideoFile = z.object({
  date: z.string(),
  items: z.array(VideoItem),
  notes: z.array(z.string()).default([]),
})
export type VideoFile = z.infer<typeof VideoFile>
