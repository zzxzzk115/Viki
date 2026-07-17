'use client'

import { useEffect } from 'react'

/**
 * Adds a click-to-load Strudel embed above every [data-strudel] block.
 * Before the click there is only a play button — no request leaves the page.
 * After it, an iframe to the strudel.cc REPL with the pattern in the URL
 * hash (their share-link format), where the visitor presses play/edits live.
 */
export function StrudelPlayer() {
  useEffect(() => {
    const blocks = document.querySelectorAll<HTMLElement>('[data-strudel]')
    const teardowns: (() => void)[] = []

    for (const block of blocks) {
      if (block.dataset.wired) continue
      block.dataset.wired = '1'
      const hash = block.dataset.strudel ?? ''
      const height = Number(block.dataset.height) || 300

      const bar = document.createElement('div')
      bar.className = 'strudel-bar'
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'strudel-load'
      btn.textContent = '▶ 加载 Strudel 播放器'
      const hint = document.createElement('span')
      hint.className = 'strudel-hint'
      hint.textContent = '内嵌 strudel.cc，点击才会加载'
      bar.append(btn, hint)
      block.prepend(bar)

      btn.addEventListener('click', () => {
        const iframe = document.createElement('iframe')
        iframe.className = 'strudel-frame'
        iframe.style.height = `${height}px`
        iframe.src = `https://strudel.cc/#${encodeURIComponent(hash)}`
        iframe.allow = 'autoplay'
        iframe.title = 'Strudel live coding'
        bar.replaceWith(iframe)
      })

      teardowns.push(() => {
        delete block.dataset.wired
      })
    }

    return () => teardowns.forEach((fn) => fn())
  }, [])

  return null
}
