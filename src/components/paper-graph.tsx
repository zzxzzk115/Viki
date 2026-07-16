'use client'

import { drag } from 'd3-drag'
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, type D3ZoomEvent } from 'd3-zoom'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { withBase } from '@/lib/base-path'
import { NO_TAG_COLOR, TAG_COLORS, nodeColor, type GraphData, type GraphNode } from '@/lib/paper-graph'

type SimNode = GraphNode & SimulationNodeDatum
type SimLink = SimulationLinkDatum<SimNode>

const HEIGHT = 600
const PAD = { left: 56, right: 40, top: 30, bottom: 48 }

/** Hovered (desktop) or tapped (mobile) node + its on-screen rect for the card. */
interface Focus {
  node: GraphNode
  rect: { left: number; right: number; top: number; bottom: number }
  /** true = tapped (card is sticky until closed); false = hover (follows). */
  sticky: boolean
}

/**
 * Citation graph, timeline-style (à la Litmaps).
 *
 * The x axis is publication year, so every citation edge points left (a paper
 * cites older work) and the arrows read consistently instead of tangling. Titles
 * are not drawn — with 36 overlapping nodes they were unreadable — the title and
 * details appear in a card on hover (desktop) or tap (mobile), which also solves
 * the no-hover problem on touch. Edges sit faint until a node is focused, then
 * that node's citation network lights up.
 *
 * "React owns the container, D3 owns the SVG": the simulation, zoom, drag and
 * per-tick updates run in a D3 effect so a full layout never re-renders React.
 * graph.json is fetched, never imported (Next would inline it into the bundle).
 */
export function PaperGraph() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [data, setData] = useState<GraphData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [active, setActive] = useState<Set<string>>(new Set()) // empty = all tags
  const [focus, setFocus] = useState<Focus | null>(null)
  // Lets the card's close button clear the D3-managed highlight.
  const highlightRef = useRef<(slug: string | null) => void>(() => {})

  useEffect(() => {
    let alive = true
    fetch(withBase('/data/graph.json'))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((g: GraphData) => {
        if (!alive) return
        setData(g)
        setState('ready')
      })
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
    }
  }, [])

  const tags = useMemo(() => {
    if (!data) return []
    const counts = new Map<string, number>()
    for (const n of data.nodes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [data])

  useEffect(() => {
    const svg = svgRef.current
    if (!data || !svg) return

    const width = svg.clientWidth || 900
    const height = HEIGHT
    // The timeline needs breathing room the year range can't get on a phone:
    // 35 years across ~300px overlaps everything. Lay it out at a fixed minimum
    // world width and fit-to-view initially, so a narrow screen sees the whole
    // timeline (zoomed out) and can pinch in.
    const worldWidth = Math.max(width, 760)
    setFocus(null)

    const visibleNodes: SimNode[] = data.nodes
      .filter((n) => active.size === 0 || n.tags.some((t) => active.has(t)))
      .map((n) => ({ ...n }))
    const shown = new Set(visibleNodes.map((n) => n.slug))
    const visibleLinks: SimLink[] = data.edges
      .filter((e) => shown.has(e.source) && shown.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }))

    // Year → x. Older left, newer right, so every edge points left.
    const years = visibleNodes.map((n) => n.year)
    const minY = Math.min(...years)
    const maxY = Math.max(...years)
    const span = Math.max(1, maxY - minY)
    const xForYear = (y: number) => PAD.left + ((y - minY) / span) * (worldWidth - PAD.left - PAD.right)
    const midY = (height - PAD.bottom + PAD.top) / 2

    const radius = (n: SimNode) => Math.min(26, 5 + Math.sqrt(n.citedBy) * 0.38)

    for (const n of visibleNodes) {
      n.x = xForYear(n.year)
      n.y = midY + (Math.random() - 0.5) * (height - PAD.top - PAD.bottom) * 0.7
    }

    const sim: Simulation<SimNode, SimLink> = forceSimulation(visibleNodes)
      // x pinned hard to the year; y spreads to avoid overlap.
      .force('x', forceX<SimNode>((d) => xForYear(d.year)).strength(0.9))
      .force('y', forceY<SimNode>(midY).strength(0.04))
      .force('charge', forceManyBody().strength(-90))
      .force('collide', forceCollide<SimNode>((d) => radius(d) + 3))
      .force('link', forceLink<SimNode, SimLink>(visibleLinks).id((d) => d.slug).distance(40).strength(0.03))

    const root = select(svg)
    root.selectAll('*').remove()

    root
      .append('defs')
      .append('marker')
      .attr('id', 'pg-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 9)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M0,-4L9,0L0,4')
      .attr('fill', 'context-stroke')

    const layer = root.append('g')

    // Year axis.
    const axis = layer.append('g').attr('class', 'axis')
    const step = span <= 12 ? 2 : 5
    const firstTick = Math.ceil(minY / step) * step
    for (let y = firstTick; y <= maxY; y += step) {
      const x = xForYear(y)
      axis
        .append('line')
        .attr('x1', x)
        .attr('x2', x)
        .attr('y1', PAD.top)
        .attr('y2', height - PAD.bottom + 10)
        .attr('stroke', 'currentColor')
        .attr('class', 'text-neutral-200 dark:text-neutral-800')
        .attr('stroke-width', 1)
      axis
        .append('text')
        .attr('x', x)
        .attr('y', height - PAD.bottom + 26)
        .attr('text-anchor', 'middle')
        .attr('font-size', 11)
        .attr('fill', 'currentColor')
        .attr('class', 'text-neutral-400')
        .text(y)
    }

    const link = layer
      .append('g')
      .attr('fill', 'none')
      .selectAll('line')
      .data(visibleLinks)
      .join('line')
      .attr('stroke', 'currentColor')
      .attr('class', 'text-neutral-400 dark:text-neutral-600')
      .attr('stroke-width', 1)
      .attr('opacity', 0.12)
      .attr('marker-end', 'url(#pg-arrow)')

    const node = layer
      .append('g')
      .selectAll<SVGCircleElement, SimNode>('circle')
      .data(visibleNodes)
      .join('circle')
      .attr('class', 'node')
      .attr('r', radius)
      .attr('fill', (d) => nodeColor(d.tags))
      .attr('stroke', 'white')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer')

    // Neighbours for highlight.
    const nbr = new Map<string, Set<string>>()
    for (const e of visibleLinks) {
      const s = typeof e.source === 'string' ? e.source : (e.source as SimNode).slug
      const t = typeof e.target === 'string' ? e.target : (e.target as SimNode).slug
      ;(nbr.get(s) ?? nbr.set(s, new Set()).get(s)!).add(t)
      ;(nbr.get(t) ?? nbr.set(t, new Set()).get(t)!).add(s)
    }
    const highlight = (slug: string | null) => {
      if (!slug) {
        node.attr('opacity', 1)
        link.attr('opacity', 0.12).attr('stroke-width', 1)
        return
      }
      const keep = nbr.get(slug) ?? new Set()
      node.attr('opacity', (n) => (n.slug === slug || keep.has(n.slug) ? 1 : 0.12))
      link
        .attr('opacity', (l) => (linkEnd(l, 'source') === slug || linkEnd(l, 'target') === slug ? 0.9 : 0.02))
        .attr('stroke-width', (l) => (linkEnd(l, 'source') === slug || linkEnd(l, 'target') === slug ? 1.6 : 1))
    }
    highlightRef.current = highlight

    const focusOf = (el: SVGCircleElement, d: SimNode, sticky: boolean): Focus => {
      const r = el.getBoundingClientRect()
      return { node: d, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, sticky }
    }

    node
      .on('mouseenter', function (_e, d) {
        highlight(d.slug)
        setFocus((f) => (f?.sticky ? f : focusOf(this, d, false)))
      })
      .on('mouseleave', () => {
        setFocus((f) => {
          if (f?.sticky) return f
          highlight(null)
          return null
        })
      })

    // Tap vs drag; touch shows a sticky card, mouse navigates.
    let downXY: [number, number] | null = null
    node
      .on('pointerdown', (e: PointerEvent) => {
        downXY = [e.clientX, e.clientY]
      })
      .on('pointerup', function (e: PointerEvent, d) {
        if (!downXY) return
        const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1])
        downXY = null
        if (moved >= 5) return
        if (e.pointerType === 'touch') {
          highlight(d.slug)
          setFocus(focusOf(this, d, true))
        } else {
          location.href = withBase(d.href)
        }
      })

    node.call(
      drag<SVGCircleElement, SimNode>()
        .on('start', (e, d) => {
          if (!e.active) sim.alphaTarget(0.2).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (e, d) => {
          d.fx = e.x
          d.fy = e.y
        })
        .on('end', (e, d) => {
          if (!e.active) sim.alphaTarget(0)
          d.fx = null
          d.fy = null
        }),
    )

    const zoomer = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 5])
      .on('zoom', (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
        layer.attr('transform', e.transform.toString())
        // A card pinned to old screen coords would drift; drop it on zoom/pan.
        setFocus((f) => (f?.sticky ? f : null))
      })
    root.call(zoomer)
    // Fit the world width into the viewport: identity on desktop (width ≥ world),
    // scaled down + vertically centred on a phone.
    const fitScale = Math.min(1, width / worldWidth)
    root.call(
      zoomer.transform,
      zoomIdentity.translate(0, (height * (1 - fitScale)) / 2).scale(fitScale),
    )

    sim.on('tick', () => {
      link
        .attr('x1', (l) => (l.source as SimNode).x!)
        .attr('y1', (l) => (l.source as SimNode).y!)
        // Stop the line at the target circle's edge so the arrow is visible, not
        // buried under the node.
        .attr('x2', (l) => edgePoint(l, radius).x)
        .attr('y2', (l) => edgePoint(l, radius).y)
      node.attr('cx', (d) => d.x!).attr('cy', (d) => d.y!)
    })

    return () => {
      sim.stop()
      root.on('.zoom', null)
      root.selectAll('*').remove()
    }
  }, [data, active])

  const toggle = (t: string) =>
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })

  const closeCard = () => {
    highlightRef.current(null)
    setFocus(null)
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActive(new Set())}
          className={`rounded-full px-3 py-1 text-xs transition ${
            active.size === 0
              ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400'
          }`}
        >
          全部
        </button>
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition ${
              active.has(t)
                ? 'text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400'
            }`}
            style={active.has(t) ? { backgroundColor: TAG_COLORS[t] ?? NO_TAG_COLOR } : undefined}
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: TAG_COLORS[t] ?? NO_TAG_COLOR }} />
            {t}
          </button>
        ))}
      </div>

      <p className="mt-2 text-xs text-neutral-400">
        横轴 = 发表年份，箭头 A→B 表示 A 引用了 B（指向更早的工作）。大小 = 全球被引数，颜色 = 主题。
        悬停（触屏点击）看论文详情、点节点进详情页；滚轮/双指缩放，拖动平移。
      </p>

      <div className="relative mt-4 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
        {state === 'error' ? (
          <p className="p-10 text-center text-sm text-red-600 dark:text-red-400">引用图加载失败。</p>
        ) : (
          <svg
            ref={svgRef}
            width="100%"
            height={HEIGHT}
            style={{ touchAction: 'none' }}
            className={state === 'loading' ? 'animate-pulse bg-neutral-50 dark:bg-neutral-900' : ''}
            role="img"
            aria-label="论文引用关系图"
          />
        )}
      </div>

      {focus && <PaperCard focus={focus} onClose={closeCard} />}
    </>
  )
}

/** Hover/tap card, fixed to the node's on-screen position. */
function PaperCard({ focus, onClose }: { focus: Focus; onClose: () => void }) {
  const { node, rect } = focus
  const W = 300
  const left = Math.min(rect.right + 10, window.innerWidth - W - 8)
  const clampedLeft = Math.max(8, left)
  const top = Math.min(rect.top, window.innerHeight - 180)

  return (
    <div
      role="tooltip"
      onPointerDown={(e) => e.stopPropagation()}
      style={{ left: clampedLeft, top: Math.max(8, top), width: W }}
      className="fixed z-50 rounded-xl border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
    >
      {focus.sticky && (
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute right-2 top-2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          ✕
        </button>
      )}
      <p className="pr-4 text-sm font-medium leading-snug">{node.title}</p>
      {node.authors.length > 0 && (
        <p className="mt-1 text-xs text-neutral-500">
          {node.authors.slice(0, 3).join(', ')}
          {node.authors.length > 3 ? ' 等' : ''}
        </p>
      )}
      <p className="mt-1.5 text-xs text-neutral-400">
        {node.venue} · 被引 {node.citedBy}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {node.tags.map((t) => (
          <span
            key={t}
            className="rounded px-1.5 py-0.5 text-[0.65rem] text-white"
            style={{ backgroundColor: TAG_COLORS[t] ?? NO_TAG_COLOR }}
          >
            {t}
          </span>
        ))}
      </div>
      {focus.sticky ? (
        // Tapped (mobile): the card is pinned, so the link is reachable.
        <Link
          href={node.href}
          className="mt-3 inline-block text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
        >
          打开论文 →
        </Link>
      ) : (
        // Hover (desktop): the card follows the cursor and vanishes on leave, so
        // a link here is unreachable — clicking the node itself navigates.
        <p className="mt-3 text-xs text-neutral-400">点击节点打开 →</p>
      )}
    </div>
  )
}

function linkEnd(l: SimLink, which: 'source' | 'target'): string {
  const v = l[which]
  return typeof v === 'string' ? v : (v as SimNode).slug
}

/** Point on the target circle's edge, so the arrowhead sits outside the node. */
function edgePoint(l: SimLink, radius: (n: SimNode) => number): { x: number; y: number } {
  const s = l.source as SimNode
  const t = l.target as SimNode
  const dx = (t.x ?? 0) - (s.x ?? 0)
  const dy = (t.y ?? 0) - (s.y ?? 0)
  const dist = Math.hypot(dx, dy) || 1
  const r = radius(t) + 5
  return { x: (t.x ?? 0) - (dx / dist) * r, y: (t.y ?? 0) - (dy / dist) * r }
}
