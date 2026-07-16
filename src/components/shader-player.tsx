'use client'

import { useEffect } from 'react'

/**
 * Mounts a live WebGL2 canvas above every [data-shader] block. The GLSL source
 * is read from the highlighted <pre>'s textContent — the code block IS the
 * source of truth (readable with JS off, searchable), nothing is duplicated
 * into attributes.
 *
 * Shadertoy conventions: user code defines
 *   void mainImage(out vec4 fragColor, in vec2 fragCoord)
 * and gets uniforms iTime (s), iResolution (px, z=1), iMouse (xy=last
 * pointer-down position, zw=0 — clicks only, so touch scrolling on mobile is
 * never hijacked).
 *
 * Every canvas pauses off-screen via IntersectionObserver — the gallery mounts
 * many at once and a dozen hidden rAF loops would cook laptop fans for nothing.
 * A compile error renders an error box in place of the canvas; the code below
 * it stays readable, matching how broken wiki-links stay visible.
 */
export function ShaderPlayer() {
  useEffect(() => {
    const blocks = document.querySelectorAll<HTMLElement>('[data-shader]')
    const teardowns: (() => void)[] = []

    for (const block of blocks) {
      if (block.dataset.wired) continue
      block.dataset.wired = '1'
      const pre = block.querySelector('pre')
      if (!pre) continue
      // The <code> child, not the pre: CopyCode injects a button label into
      // the pre, and "复制" is not valid GLSL.
      const source = (pre.querySelector('code') ?? pre).textContent ?? ''
      const height = Number(block.dataset.height) || 260

      const down = mount(block, source, height)
      teardowns.push(() => {
        down()
        delete block.dataset.wired
      })
    }

    return () => teardowns.forEach((fn) => fn())
  }, [])

  return null
}

const VERT = `#version 300 es
void main() {
  // Fullscreen triangle from gl_VertexID — no buffers needed.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const FRAG_HEADER = `#version 300 es
precision highp float;
uniform float iTime;
uniform vec3 iResolution;
uniform vec4 iMouse;
out vec4 viki_fragColor;
`

const FRAG_FOOTER = `
void main() {
  mainImage(viki_fragColor, gl_FragCoord.xy);
}`

function mount(block: HTMLElement, source: string, height: number): () => void {
  const canvas = document.createElement('canvas')
  canvas.className = 'shader-canvas'
  canvas.style.height = `${height}px`
  block.prepend(canvas)

  const fail = (msg: string) => {
    canvas.remove()
    const err = document.createElement('pre')
    err.className = 'shader-error'
    err.textContent = `着色器编译失败：\n${msg}`
    block.prepend(err)
    return () => err.remove()
  }

  // preserveDrawingBuffer: without it the buffer is cleared after compositing,
  // so right-click-save-image (and any toDataURL screenshotting) reads black.
  // For canvases this small the copy cost is noise.
  const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true })
  if (!gl) return fail('此浏览器不支持 WebGL2')

  const program = gl.createProgram()!
  const compile = (type: number, src: string): WebGLShader | string => {
    const sh = gl.createShader(type)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) ?? 'unknown error'
      gl.deleteShader(sh)
      return log
    }
    return sh
  }

  const vs = compile(gl.VERTEX_SHADER, VERT)
  const fs = compile(gl.FRAGMENT_SHADER, FRAG_HEADER + source + FRAG_FOOTER)
  if (typeof fs === 'string') {
    // Header is 7 lines; shift reported line numbers back to the user's source.
    const adjusted = fs.replace(/0:(\d+)/g, (_m, n) => `第 ${Math.max(1, Number(n) - 7)} 行`)
    return fail(adjusted)
  }
  if (typeof vs === 'string') return fail(vs) // ours; should never happen

  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return fail(gl.getProgramInfoLog(program) ?? 'link failed')
  }
  gl.useProgram(program)

  const uTime = gl.getUniformLocation(program, 'iTime')
  const uRes = gl.getUniformLocation(program, 'iResolution')
  const uMouse = gl.getUniformLocation(program, 'iMouse')

  let mouse: [number, number] = [0, 0]
  const onPointerDown = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    // Bottom-left origin, Shadertoy-style; scale CSS px to drawing-buffer px.
    mouse = [
      ((e.clientX - r.left) / r.width) * canvas.width,
      (1 - (e.clientY - r.top) / r.height) * canvas.height,
    ]
  }
  canvas.addEventListener('pointerdown', onPointerDown)

  let raf = 0
  let running = false
  const start = performance.now()

  const frame = () => {
    // Resize lazily to the displayed size (device pixels capped at 2x).
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }
    gl.uniform1f(uTime, (performance.now() - start) / 1000)
    gl.uniform3f(uRes, w, h, 1)
    gl.uniform4f(uMouse, mouse[0], mouse[1], 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    raf = requestAnimationFrame(frame)
  }

  const io = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !running) {
      running = true
      raf = requestAnimationFrame(frame)
    } else if (!entry.isIntersecting && running) {
      running = false
      cancelAnimationFrame(raf)
    }
  })
  io.observe(canvas)

  return () => {
    io.disconnect()
    cancelAnimationFrame(raf)
    canvas.removeEventListener('pointerdown', onPointerDown)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    canvas.remove()
  }
}
