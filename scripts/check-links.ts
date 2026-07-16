/**
 * Fails the build on dead internal links, by checking the exported site rather
 * than the source.
 *
 * Checking out/ is the point: "does this path exist" becomes "did next build
 * emit an index.html for it", which is ground truth and needs no route list to
 * be kept in sync. It covers every link source at once — wiki-links, plain
 * markdown links, next/link hrefs, TOC anchors, card back-links.
 *
 * Runs after `next build`. A dead link is silent otherwise: the markup looks
 * fine and only 404s when a reader clicks it — which is exactly how the
 * basePath bug reached production.
 */
import { readFile } from 'node:fs/promises'
import { join, posix } from 'node:path'
import fg from 'fast-glob'

const OUT = join(process.cwd(), 'out')
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '/Viki'

interface Dead {
  page: string
  href: string
  text: string
  why: string
}

/** A malformed escape must not crash the whole check. */
function decode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Strips tags so a dead link can be reported by the text the reader sees. */
function linkText(tag: string, html: string, at: number): string {
  const close = html.indexOf('</a>', at)
  if (close < 0) return ''
  return html
    .slice(at + tag.length, close)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

async function main() {
  const files = await fg('**/*.html', { cwd: OUT, absolute: false })
  const pages = new Map<string, string>()

  for (const f of files) {
    // out/notes/foo/index.html -> /notes/foo/
    const route = '/' + f.replace(/index\.html$/, '').replace(/\.html$/, '/')
    pages.set(posix.normalize(route), await readFile(join(OUT, f), 'utf8'))
  }

  const idsOf = new Map<string, Set<string>>()
  for (const [route, html] of pages) {
    idsOf.set(route, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])))
  }

  const dead: Dead[] = []
  let checked = 0

  for (const [route, html] of pages) {
    for (const m of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>/g)) {
      const href = m[1]
      // Skip anything not a site path: external, protocol-relative, mailto, etc.
      if (!href.startsWith('/') && !href.startsWith('#')) continue
      if (href.startsWith('//')) continue
      checked++

      const text = linkText(m[0], html, m.index!)
      const [encodedPath, rawHash] = href.split('#')
      const hash = rawHash ? decode(rawHash) : ''
      // Routes are keyed by on-disk names, which are literal (out/tags/光学/),
      // while hrefs are percent-encoded. Without decoding, every Chinese tag
      // and heading anchor reads as a dead link. The query string (the editor's
      // ?path=…) is not part of the route either.
      const rawPath = decode(encodedPath.split('?')[0])

      // A bare '#anchor' targets the current page.
      let target = route
      if (rawPath) {
        if (!rawPath.startsWith(`${BASE}/`) && rawPath !== BASE) {
          dead.push({
            page: route,
            href,
            text,
            why: `缺少 basePath (${BASE})，会 404。笔记正文里的根路径应由 rehype-base-path 自动加前缀`,
          })
          continue
        }
        const stripped = rawPath.slice(BASE.length) || '/'
        target = posix.normalize(stripped.endsWith('/') ? stripped : `${stripped}/`)
        if (!pages.has(target)) {
          dead.push({ page: route, href, text, why: `目标页不存在: ${target}` })
          continue
        }
      }

      if (hash) {
        const ids = idsOf.get(target)
        if (ids && !ids.has(hash)) {
          dead.push({ page: route, href, text, why: `锚点 #${hash} 在 ${target} 上不存在` })
        }
      }
    }
  }

  // Card back-links are rendered client-side from cards.json, so they never
  // appear in out/*.html and the scan above is blind to them. This is how the
  // paper back-links (/notes/papers/... instead of /papers/...) slipped through.
  const cardsFile = join(OUT, 'data', 'cards.json')
  const cards: { id: string; noteHref: string; anchor: string; noteTitle: string }[] = JSON.parse(
    await readFile(cardsFile, 'utf8'),
  )
  for (const c of cards) {
    checked++
    const target = posix.normalize(c.noteHref)
    if (!pages.has(target)) {
      dead.push({
        page: 'public/data/cards.json',
        href: c.noteHref,
        text: `卡片 ${c.id} 的回链 (${c.noteTitle})`,
        why: `目标页不存在: ${target}`,
      })
      continue
    }
    if (c.anchor && !idsOf.get(target)?.has(c.anchor)) {
      dead.push({
        page: 'public/data/cards.json',
        href: `${c.noteHref}#${c.anchor}`,
        text: `卡片 ${c.id} 的回链锚点`,
        why: `锚点 #${c.anchor} 在 ${target} 上不存在`,
      })
    }
  }

  // Graph node links are rendered client-side from graph.json too — same blind
  // spot as card back-links. Every node's href must hit a real /papers/ page.
  const graphFile = join(OUT, 'data', 'graph.json')
  const graph: { nodes: { slug: string; href: string }[] } = JSON.parse(await readFile(graphFile, 'utf8'))
  for (const n of graph.nodes) {
    checked++
    const target = posix.normalize(n.href)
    if (!pages.has(target)) {
      dead.push({
        page: 'public/data/graph.json',
        href: n.href,
        text: `引用图节点 ${n.slug}`,
        why: `目标页不存在: ${target}`,
      })
    }
  }

  if (dead.length) {
    console.error(`\n✗ 发现 ${dead.length} 个死链:\n`)
    for (const d of dead) {
      console.error(`  页面: ${d.page}`)
      console.error(`  链接: "${d.text}" -> ${d.href}`)
      console.error(`  原因: ${d.why}\n`)
    }
    process.exit(1)
  }

  console.log(`✓ ${checked} 个站内链接全部可达 (${pages.size} 个页面)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
