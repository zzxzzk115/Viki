'use client'

import { drag } from 'd3-drag'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, type D3ZoomEvent } from 'd3-zoom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { withBase } from '@/lib/base-path'
import { NO_TAG_COLOR, TAG_COLORS, nodeColor, type GraphData, type GraphNode } from '@/lib/paper-graph'

type SimNode = GraphNode & SimulationNodeDatum
type SimLink = SimulationLinkDatum<SimNode>

const HEIGHT = 620

/**
 * Force-directed citation graph.
 *
 * "React owns the container, D3 owns the SVG contents": React renders the <svg>
 * shell and the tag filter; the simulation, zoom, drag and per-tick position
 * updates all happen in a D3-managed effect, so a 300-tick layout never triggers
 * a React re-render.
 *
 * graph.json is fetched, never imported — Next inlines imported JSON into the
 * bundle, which would grow with the library.
 */
export function PaperGraph() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [data, setData] = useState<GraphData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [active, setActive] = useState<Set<string>>(new Set()) // empty = all tags

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
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t)
  }, [data])

  useEffect(() => {
    const svg = svgRef.current
    if (!data || !svg) return

    const width = svg.clientWidth || 800
    const height = HEIGHT

    // Visible subset: a node passes if any of its tags is active (or nothing is
    // filtered); an edge only when both endpoints are visible.
    const visibleNodes: SimNode[] = data.nodes
      .filter((n) => active.size === 0 || n.tags.some((t) => active.has(t)))
      .map((n) => ({ ...n }))
    const shown = new Set(visibleNodes.map((n) => n.slug))
    const visibleLinks: SimLink[] = data.edges
      .filter((e) => shown.has(e.source) && shown.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }))

    // Cluster anchors: each tag gets a point on a circle, nodes are pulled toward
    // their first tag's anchor so topics form clumps even where citations are sparse.
    const clusterTags = [...new Set(visibleNodes.flatMap((n) => n.tags))]
    const anchor = new Map(
      clusterTags.map((t, i) => {
        const a = (i / clusterTags.length) * 2 * Math.PI
        return [t, { x: width / 2 + Math.cos(a) * width * 0.28, y: height / 2 + Math.sin(a) * height * 0.32 }]
      }),
    )
    const anchorOf = (n: SimNode) => anchor.get(n.tags[0]) ?? { x: width / 2, y: height / 2 }
    // Seed near the anchor so the layout converges fast and without a big jump.
    for (const n of visibleNodes) {
      const a = anchorOf(n)
      n.x = a.x + (Math.random() - 0.5) * 60
      n.y = a.y + (Math.random() - 0.5) * 60
    }

    const radius = (n: SimNode) => Math.min(28, 5 + Math.sqrt(n.citedBy) * 0.4)

    const sim: Simulation<SimNode, SimLink> = forceSimulation(visibleNodes)
      .force('link', forceLink<SimNode, SimLink>(visibleLinks).id((d) => d.slug).distance(70).strength(0.4))
      .force('charge', forceManyBody().strength(-260))
      .force('center', forceCenter(width / 2, height / 2).strength(0.05))
      .force('x', forceX<SimNode>((d) => anchorOf(d).x).strength(0.09))
      .force('y', forceY<SimNode>((d) => anchorOf(d).y).strength(0.09))
      .force('collide', forceCollide<SimNode>((d) => radius(d) + 4))

    // --- render ---
    const root = select(svg)
    root.selectAll('*').remove()

    root
      .append('defs')
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', 'currentColor')
      .attr('class', 'text-neutral-400')

    const layer = root.append('g')

    const link = layer
      .append('g')
      .attr('class', 'edges text-neutral-300 dark:text-neutral-700')
      .attr('stroke', 'currentColor')
      .attr('stroke-width', 1)
      .selectAll('line')
      .data(visibleLinks)
      .join('line')
      .attr('marker-end', 'url(#arrow)')

    const node = layer
      .append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, SimNode>('g')
      .data(visibleNodes)
      .join('g')
      .attr('class', 'node')
      .attr('cursor', 'pointer')

    node
      .append('circle')
      .attr('r', radius)
      .attr('fill', (d) => nodeColor(d.tags))
      .attr('stroke', 'white')
      .attr('stroke-width', 1.5)

    node
      .append('text')
      .text((d) => shortTitle(d.title))
      .attr('x', (d) => radius(d) + 3)
      .attr('y', 4)
      .attr('font-size', 10)
      .attr('fill', 'currentColor')
      .attr('class', 'text-neutral-600 dark:text-neutral-300')
      .attr('pointer-events', 'none')

    // Neighbour highlight on hover.
    const neighbours = new Map<string, Set<string>>()
    for (const e of visibleLinks) {
      const s = typeof e.source === 'string' ? e.source : (e.source as SimNode).slug
      const t = typeof e.target === 'string' ? e.target : (e.target as SimNode).slug
      ;(neighbours.get(s) ?? neighbours.set(s, new Set()).get(s)!).add(t)
      ;(neighbours.get(t) ?? neighbours.set(t, new Set()).get(t)!).add(s)
    }
    node
      .on('mouseenter', (_e, d) => {
        const keep = neighbours.get(d.slug) ?? new Set()
        node.attr('opacity', (n) => (n.slug === d.slug || keep.has(n.slug) ? 1 : 0.15))
        link.attr('opacity', (l) => (endpoint(l, 'source') === d.slug || endpoint(l, 'target') === d.slug ? 1 : 0.05))
      })
      .on('mouseleave', () => {
        node.attr('opacity', 1)
        link.attr('opacity', 1)
      })

    // Click vs drag: only navigate if the pointer barely moved.
    let downXY: [number, number] | null = null
    node
      .on('pointerdown', (e: PointerEvent) => {
        downXY = [e.clientX, e.clientY]
      })
      .on('pointerup', (e: PointerEvent, d) => {
        if (!downXY) return
        const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1])
        downXY = null
        if (moved < 5) location.href = withBase(d.href)
      })

    // Drag nodes.
    node.call(
      drag<SVGGElement, SimNode>()
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

    // Zoom / pan.
    const zoomer = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (e: D3ZoomEvent<SVGSVGElement, unknown>) => layer.attr('transform', e.transform.toString()))
    root.call(zoomer)
    root.call(zoomer.transform, zoomIdentity)

    sim.on('tick', () => {
      link
        .attr('x1', (l) => (l.source as SimNode).x!)
        .attr('y1', (l) => (l.source as SimNode).y!)
        .attr('x2', (l) => (l.target as SimNode).x!)
        .attr('y2', (l) => (l.target as SimNode).y!)
      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
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
        节点=论文（大小 = 全球被引数），箭头=引用（A→B 表示 A 引用了 B），颜色=主题。
        点开关筛主题、滚轮缩放、拖动平移、点节点进详情。
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
        {state === 'error' ? (
          <p className="p-10 text-center text-sm text-red-600 dark:text-red-400">引用图加载失败。</p>
        ) : (
          <svg
            ref={svgRef}
            width="100%"
            height={HEIGHT}
            className={state === 'loading' ? 'animate-pulse bg-neutral-50 dark:bg-neutral-900' : ''}
            role="img"
            aria-label="论文引用关系图"
          />
        )}
      </div>
    </>
  )
}

function endpoint(l: SimLink, which: 'source' | 'target'): string {
  const v = l[which]
  return typeof v === 'string' ? v : (v as SimNode).slug
}

/** First clause of the title, capped, for an in-graph label. */
function shortTitle(title: string): string {
  const head = title.split(/[:：]/)[0]
  return head.length > 22 ? head.slice(0, 21) + '…' : head
}
