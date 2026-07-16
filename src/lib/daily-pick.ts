/**
 * Deterministic date-seeded pick for the homepage's 「今日论文」.
 *
 * Runs client-side after mount: the page is prerendered once at build, so a
 * build-time "today" would freeze the first day nothing was deployed. Being
 * date-seeded (not Math.random) means every visitor sees the same pick on the
 * same day, and reloading does not reshuffle.
 */

/** djb2 over the seed string — stable across platforms, no BigInt. */
export function dailyIndex(seed: string, length: number): number {
  if (length <= 0) return 0
  let h = 5381
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0
  }
  return h % length
}

/** Local date, not UTC — "today's paper" should flip at the reader's midnight. */
export function todaySeed(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

export function pickDaily<T>(items: T[], seed: string): T | null {
  if (items.length === 0) return null
  return items[dailyIndex(seed, items.length)]
}
