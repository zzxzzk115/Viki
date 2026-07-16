'use client'

import { useEffect } from 'react'

/**
 * Wires up every ::::demo in the note body.
 *
 * The decks are static HTML inside a dangerouslySetInnerHTML block, so React
 * cannot own them — this scans for [data-demo] after mount and attaches the
 * controls imperatively. That is the price of keeping note bodies as prebuilt
 * HTML, and it buys a real property: with JS off, every step is still on the
 * page and readable, and the search index sees all of it. A canvas or video
 * animation would be opaque to both.
 */
export function DemoPlayer() {
  useEffect(() => {
    const decks = document.querySelectorAll<HTMLElement>('[data-demo]')
    const teardown: (() => void)[] = []

    for (const deck of decks) {
      if (deck.dataset.wired) continue
      deck.dataset.wired = '1'

      const steps = [...deck.querySelectorAll<HTMLElement>('.demo-step')]
      if (steps.length === 0) continue

      let current = 0

      const bar = document.createElement('div')
      bar.className = 'demo-bar'

      const prev = document.createElement('button')
      prev.type = 'button'
      prev.textContent = '←'
      prev.setAttribute('aria-label', '上一步')

      const next = document.createElement('button')
      next.type = 'button'
      next.textContent = '→'
      next.setAttribute('aria-label', '下一步')

      const caption = document.createElement('span')
      caption.className = 'demo-caption'

      const counter = document.createElement('span')
      counter.className = 'demo-counter'

      bar.append(prev, caption, counter, next)
      deck.append(bar)

      const render = () => {
        steps.forEach((s, i) => s.classList.toggle('is-active', i === current))
        caption.textContent = steps[current].dataset.caption ?? ''
        counter.textContent = `${current + 1} / ${steps.length}`
        prev.disabled = current === 0
        next.disabled = current === steps.length - 1
      }

      const go = (d: number) => {
        current = Math.min(steps.length - 1, Math.max(0, current + d))
        render()
      }

      const onPrev = () => go(-1)
      const onNext = () => go(1)
      // Arrow keys only while the deck has focus — the page has its own
      // scrolling and other decks of its own.
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          go(-1)
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          go(1)
        }
      }

      prev.addEventListener('click', onPrev)
      next.addEventListener('click', onNext)
      deck.addEventListener('keydown', onKey)
      deck.tabIndex = 0

      render()

      teardown.push(() => {
        prev.removeEventListener('click', onPrev)
        next.removeEventListener('click', onNext)
        deck.removeEventListener('keydown', onKey)
        bar.remove()
        steps.forEach((s) => s.classList.remove('is-active'))
        delete deck.dataset.wired
      })
    }

    return () => teardown.forEach((fn) => fn())
  }, [])

  return null
}
