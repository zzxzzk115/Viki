import { z } from 'zod'

/** One recommended article, as written to data/reading/latest.json. */
export const ReadingItem = z.object({
  /** Stable hash of the url. */
  id: z.string(),
  category: z.enum(['english', 'tech', 'culture']),
  /** Display name of the source, e.g. 'Hacker News'. */
  source: z.string(),
  title: z.string(),
  url: z.string(),
  /** Plain-text summary, capped. '' when the source has none (e.g. an HN link). */
  summary: z.string().default(''),
  author: z.string().optional(),
  /** ISO date; '' when unknown. */
  published: z.string().default(''),
  tags: z.array(z.string()).default([]),
})
export type ReadingItem = z.infer<typeof ReadingItem>

export const ReadingFile = z.object({
  date: z.string(),
  items: z.array(ReadingItem),
  notes: z.array(z.string()).default([]),
})
export type ReadingFile = z.infer<typeof ReadingFile>
