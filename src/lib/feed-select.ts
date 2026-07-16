/**
 * Per-topic quota selection for the feed. Pure, so the fairness property is
 * unit-testable without arXiv.
 *
 * Why quotas: ranking purely by score lets the highest-volume topic take every
 * slot — foveated rendering has more core terms and more papers, so image
 * warping / inpainting never surfaced. Each topic gets `quota` guaranteed slots
 * (if it has candidates); leftovers go to the best remaining scores regardless
 * of topic, so a quiet week in one topic returns its slots to the pool.
 */

export interface Selectable {
  score: number
  topic: string
}

export function selectWithQuota<T extends Selectable>(
  pool: T[],
  topics: string[],
  quota: number,
  limit: number,
): T[] {
  const byScore = [...pool].sort((a, b) => b.score - a.score)
  const picked = new Set<T>()

  // Guaranteed rounds, topic by topic in config order.
  for (const topic of topics) {
    let taken = 0
    for (const p of byScore) {
      if (taken >= quota || picked.size >= limit) break
      if (p.topic === topic && !picked.has(p)) {
        picked.add(p)
        taken++
      }
    }
  }

  // Free slots: best remaining scores, any topic (including '').
  for (const p of byScore) {
    if (picked.size >= limit) break
    if (!picked.has(p)) picked.add(p)
  }

  // Present by score, not by pick order — the quota is about presence, not rank.
  return [...picked].sort((a, b) => b.score - a.score)
}
