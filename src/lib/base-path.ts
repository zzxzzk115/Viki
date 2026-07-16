/**
 * basePath does NOT get applied to raw strings — only to next/link, next/image
 * and imported CSS. A bare `fetch('/data/cards.json')` or `<img src="/x.png">`
 * resolves against the origin and 404s on Pages, where the site lives at /Viki.
 *
 * Every runtime-fetched URL and every hand-written asset path goes through withBase().
 *
 * NEXT_PUBLIC_* is inlined at build time, so this is a literal in the bundle.
 * Must stay in sync with `basePath` in next.config.ts.
 */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '/Viki'

export function withBase(path: string): string {
  if (!path.startsWith('/')) throw new Error(`withBase expects an absolute path, got: ${path}`)
  return `${BASE}${path}`
}
