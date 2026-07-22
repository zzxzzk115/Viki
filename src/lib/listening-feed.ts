import { z } from 'zod'

/** One dictation clip, written to data/listening/latest.json. */
export const ListeningItem = z.object({
  id: z.string(),
  /** The exact transcript of this segment — this is the answer key. */
  text: z.string(),
  /** Real broadcast mp3 (VOA Learning English). Played via <audio>, no CORS needed. */
  audio: z.string(),
  /** Play window inside the article mp3, as fractions of total duration. */
  startFrac: z.number().default(0),
  endFrac: z.number().default(1),
  /** Chinese translation, shown after answering. Empty for real-news clips. */
  translation: z.string().default(''),
  /** Headline of the source story. */
  title: z.string().default(''),
  /** Program the clip comes from, e.g. "VOA · Science & Technology". */
  source: z.string().default(''),
  /** Link to the full article + audio, to read along after dictation. */
  url: z.string().default(''),
})
export type ListeningItem = z.infer<typeof ListeningItem>

export const ListeningFile = z.object({
  date: z.string(),
  items: z.array(ListeningItem),
  notes: z.array(z.string()).default([]),
})
export type ListeningFile = z.infer<typeof ListeningFile>
