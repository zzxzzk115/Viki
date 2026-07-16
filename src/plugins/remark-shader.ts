import type { Code, Root, RootContent } from 'mdast'
import type { VFile } from 'vfile'
import { visit } from 'unist-util-visit'

/**
 * ::::shader — a live-running GLSL fragment shader embedded in a note.
 *
 *   ::::shader{height=280}
 *   ```glsl
 *   void mainImage(out vec4 fragColor, in vec2 fragCoord) { ... }
 *   ```
 *   ::::
 *
 * The source STAYS a visible, shiki-highlighted code block: readable with JS
 * off, indexed by search (only Note.text is indexed — hiding the source in a
 * data attribute would make shaders unsearchable). ShaderPlayer mounts a
 * WebGL2 canvas above the <pre> after hydration and reads the source from its
 * textContent — one representation, no duplication.
 *
 * Shadertoy conventions (mainImage / iTime / iResolution / iMouse) so effects
 * port both ways.
 */

export interface ShaderInfo {
  source: string
  height: number
}

declare module 'vfile' {
  interface DataMap {
    shaders: ShaderInfo[]
    shaderErrors: string[]
  }
}

interface Directive {
  type: string
  name?: string
  attributes?: Record<string, string | null | undefined> | null
  children?: RootContent[]
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

const DEFAULT_HEIGHT = 260

export function remarkShader() {
  return (tree: Root, file: VFile) => {
    const shaders: ShaderInfo[] = []
    const errors: string[] = []

    visit(tree, (node) => {
      const n = node as Directive
      if (n.type !== 'containerDirective' || n.name !== 'shader') return

      const code = (n.children ?? []).find(
        (c): c is Code => c.type === 'code' && (c as Code).lang === 'glsl',
      )
      if (!code) {
        errors.push('::::shader 里没有 ```glsl 代码块')
        return
      }

      const height = Math.min(600, Math.max(120, Number(n.attributes?.height) || DEFAULT_HEIGHT))
      shaders.push({ source: code.value, height })

      n.data = {
        hName: 'div',
        hProperties: {
          className: ['shader'],
          'data-shader': '',
          'data-height': String(height),
        },
      }
      // Keep only the code block inside the wrapper — stray prose would render
      // under the canvas of every shader.
      n.children = [code as unknown as RootContent]
    })

    file.data.shaders = shaders
    file.data.shaderErrors = errors
  }
}
