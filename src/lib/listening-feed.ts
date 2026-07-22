import { z } from 'zod'

/** One dictation clip, written to data/listening/latest.json. */
export const ListeningItem = z.object({
  id: z.string(),
  /** The exact transcript — this is the answer key. */
  text: z.string(),
  /** Human-recorded mp3 (Tatoeba). Played via <audio>, no CORS needed. */
  audio: z.string(),
  /** Chinese translation, shown after answering. */
  translation: z.string().default(''),
  author: z.string().optional(),
})
export type ListeningItem = z.infer<typeof ListeningItem>

export const ListeningFile = z.object({
  date: z.string(),
  items: z.array(ListeningItem),
  notes: z.array(z.string()).default([]),
})
export type ListeningFile = z.infer<typeof ListeningFile>
