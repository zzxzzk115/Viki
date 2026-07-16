'use client'

import { useEffect } from 'react'

/**
 * Copy buttons for every code block, injected post-mount — the blocks live in
 * build-time HTML (dangerouslySetInnerHTML), so a React wrapper around each
 * <pre> is not an option, and re-parenting a React-rendered <pre> into a new
 * wrapper div would break React's unmount (removeChild on a moved node).
 * Everything is appended INSIDE the pre instead.
 *
 * The button sits in a zero-height position:sticky row, so it stays pinned to
 * the visible corner while long lines scroll horizontally underneath (a plain
 * absolute button rides along with the scrolled content).
 *
 * Copy reads the <code> child, never pre.textContent — the injected button
 * label lives inside the pre and must not leak into the copied text (or into
 * ShaderPlayer, which reads the same code element for GLSL source).
 */
export function CopyCode() {
  useEffect(() => {
    const wire = () => {
      for (const pre of document.querySelectorAll<HTMLPreElement>('pre')) {
        if (pre.dataset.copyWired || pre.classList.contains('shader-error')) continue
        // Skip invisible blocks (e.g. the gallery's hidden source pres).
        if (pre.offsetParent === null && getComputedStyle(pre).position !== 'fixed') continue
        const codeEl = pre.querySelector('code')
        const text = () => (codeEl ?? pre).textContent ?? ''
        if (!text().trim()) continue
        pre.dataset.copyWired = '1'

        const row = document.createElement('span')
        row.className = 'code-copy-row'
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'code-copy'
        btn.textContent = '复制'
        btn.setAttribute('aria-label', '复制代码')
        btn.addEventListener('click', async () => {
          btn.textContent = (await copyText(text())) ? '✓ 已复制' : '复制失败'
          btn.classList.add('is-done')
          setTimeout(() => {
            btn.textContent = '复制'
            btn.classList.remove('is-done')
          }, 1500)
        })
        row.appendChild(btn)
        pre.insertBefore(row, pre.firstChild)
      }
    }

    // MutationObserver, not a one-shot scan: client-side navigation swaps page
    // content without remounting the layout, and review/quiz answers inject
    // HTML (which may contain code) at any time. dataset guard keeps the
    // observer->wire->mutate cycle from looping.
    wire()
    const mo = new MutationObserver(() => wire())
    mo.observe(document.body, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])

  return null
}

/** Clipboard API first; textarea+execCommand fallback covers non-secure
 *  contexts (self-hosted over plain http) and stricter permission setups. */
async function copyText(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t)
    return true
  } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = t
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
