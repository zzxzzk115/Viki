import type { Root, RootContent } from 'mdast'
import type { VFile } from 'vfile'
import { visit } from 'unist-util-visit'

/**
 * ::::demo / :::step — a step-through slide deck embedded in a note.
 *
 * Manim-like explanation without Manim: Manim renders video, which would mean
 * Python + cairo + ffmpeg in CI (~4 minutes of install before a single frame),
 * multi-MB binaries in the repo, and a deploy that goes from 30s to minutes.
 * A slide deck gets the same explanatory job done as static HTML that is KBs,
 * steppable, re-readable, and — because each step is ordinary markdown — gets
 * KaTeX and shiki from the pipeline that is already there.
 *
 *   ::::demo{title="基数排序"}
 *   :::step{caption="按个位分桶"}
 *   任意 markdown：公式 $O(nk)$、代码、表格、::array
 *   :::
 *   ::::
 *
 * Emits static HTML with every step present; DemoPlayer shows one at a time.
 * That means the whole deck is readable with JS off and indexable by search —
 * a canvas animation would be neither.
 */

declare module 'vfile' {
  interface DataMap {
    demoErrors: string[]
    demoCount: number
  }
}

interface Directive {
  type: string
  name?: string
  attributes?: Record<string, string | null | undefined> | null
  children?: RootContent[]
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

export function remarkDemo() {
  return (tree: Root, file: VFile) => {
    const errors: string[] = []
    let count = 0

    visit(tree, (node) => {
      const n = node as Directive
      if (n.type !== 'containerDirective' || n.name !== 'demo') return

      const steps = (n.children ?? []).filter(
        (c) => (c as Directive).type === 'containerDirective' && (c as Directive).name === 'step',
      ) as unknown as Directive[]

      if (steps.length === 0) {
        errors.push('::::demo 里没有 :::step')
        return
      }

      const title = n.attributes?.title?.trim() ?? ''
      count++

      steps.forEach((s, i) => {
        s.data = {
          hName: 'div',
          hProperties: {
            className: ['demo-step'],
            'data-step': String(i),
            'data-caption': s.attributes?.caption?.trim() ?? '',
          },
        }
      })

      n.data = {
        hName: 'div',
        hProperties: {
          className: ['demo'],
          'data-demo': '',
          'data-title': title,
          'data-steps': String(steps.length),
        },
      }
      // Drop anything that is not a step: stray prose inside the deck would
      // render under every step and read as part of each one.
      n.children = steps as unknown as RootContent[]
    })

    file.data.demoErrors = errors
    file.data.demoCount = count
  }
}

/**
 * ::array{values="170 45 75" highlight="0 2" note="个位=0"} — the boxes-and-
 * labels visual that array algorithms need on nearly every step.
 *
 * A leaf directive rather than hand-written HTML per step: radix sort alone is
 * a dozen steps, and hand-drawing each one is how a demo stops getting updated.
 */
export function remarkArray() {
  return (tree: Root, file: VFile) => {
    const errors: string[] = file.data.demoErrors ?? []

    visit(tree, (node) => {
      const n = node as Directive
      if (n.type !== 'leafDirective' || n.name !== 'array') return

      const raw = n.attributes?.values?.trim()
      if (!raw) {
        errors.push('::array 缺少 values')
        return
      }
      const values = raw.split(/[\s,]+/).filter(Boolean)
      const highlight = new Set(
        (n.attributes?.highlight ?? '')
          .split(/[\s,]+/)
          .filter(Boolean)
          .map(Number),
      )
      const dim = new Set(
        (n.attributes?.dim ?? '')
          .split(/[\s,]+/)
          .filter(Boolean)
          .map(Number),
      )
      const label = n.attributes?.label?.trim()

      const cells: RootContent[] = values.map(
        (v, i) =>
          ({
            type: 'emphasis',
            data: {
              hName: 'span',
              hProperties: {
                className: [
                  'array-cell',
                  highlight.has(i) ? 'is-hl' : '',
                  dim.has(i) ? 'is-dim' : '',
                ].filter(Boolean),
              },
            },
            children: [{ type: 'text', value: v }],
          }) as unknown as RootContent,
      )

      n.data = {
        hName: 'div',
        hProperties: { className: ['array-viz'], ...(label ? { 'data-label': label } : {}) },
      }
      n.children = cells
    })

    file.data.demoErrors = errors
  }
}
