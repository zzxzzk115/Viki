import { z } from 'zod'

/** One recommended paper, as written to data/papers/latest.json. */
export const FeedPaper = z.object({
  /** Versionless arXiv id ('2607.13808'), or the provider's id. */
  id: z.string(),
  source: z.enum(['arxiv', 'openalex']),
  title: z.string(),
  authors: z.array(z.string()),
  abstract: z.string(),
  /** ISO date the paper was published/announced. */
  published: z.string(),
  url: z.string(),
  pdf: z.string().optional(),
  categories: z.array(z.string()).default([]),
  /** Keywords from config/feeds.ts that this paper matched. */
  matched: z.array(z.string()).default([]),
  /** Higher = more relevant. Drives ordering and the daily cut. */
  score: z.number(),
  comment: z.string().optional(),
})
export type FeedPaper = z.infer<typeof FeedPaper>

export const FeedFile = z.object({
  /** Date the fetch ran, YYYY-MM-DD. */
  date: z.string(),
  papers: z.array(FeedPaper),
  /** Non-fatal notes from the fetch — shown on /arxiv so a silently empty
   *  feed is distinguishable from a genuinely quiet day. */
  notes: z.array(z.string()).default([]),
})
export type FeedFile = z.infer<typeof FeedFile>
