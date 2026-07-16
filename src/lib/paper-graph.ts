/**
 * Shared types + tag palette for the paper citation graph.
 * No server-only imports — both build-content.ts and the client component use it.
 */

export interface GraphNode {
  slug: string // 'papers/<name>'
  href: string
  title: string
  authors: string[]
  year: number
  venue: string
  tags: string[]
  /** Global citation count from OpenAlex — drives node radius. */
  citedBy: number
}

export interface GraphEdge {
  source: string // slug
  target: string // slug
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * Fixed tag → colour so a topic is the same colour on every visit. Tableau-20
 * values: distinct, and mid-lightness so they read on both light and dark.
 * A node's colour comes from its FIRST tag; the same order drives cluster force.
 */
export const TAG_COLORS: Record<string, string> = {
  图像变形: '#4e79a7',
  图像补全: '#f28e2c',
  注视点渲染: '#e15759',
  重投影: '#76b7b2',
  立体渲染: '#59a14f',
  着色: '#edc949',
  时域抗锯齿: '#af7aa1',
  屏幕空间: '#ff9da7',
  点渲染: '#9c755f',
  '光场/IBR': '#bab0ab',
  感知驱动: '#8cd17d',
  VR: '#b6992d',
  光线追踪: '#499894',
}

/** neutral-400 — for a paper whose tags the keyword dictionary never matched. */
export const NO_TAG_COLOR = '#9ca3af'

export function nodeColor(tags: string[]): string {
  return TAG_COLORS[tags[0]] ?? NO_TAG_COLOR
}
