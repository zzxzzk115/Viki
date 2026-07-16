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

      /**
       * Pin every step to the tallest one's height, so stepping through does
       * not resize the deck. Steps differ in height — one array row vs six —
       * and without this the page reflows on every click and whatever the
       * reader was looking at moves under them.
       *
       * Measurable only before data-wired hides them, hence the ordering here.
       */
      const equalize = () => {
        steps.forEach((s) => (s.style.minHeight = ''))
        const wired = deck.dataset.wired
        delete deck.dataset.wired // reveal all to measure
        const tallest = Math.max(...steps.map((s) => s.offsetHeight))
        if (wired) deck.dataset.wired = wired
        steps.forEach((s) => (s.style.minHeight = `${tallest}px`))
      }

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
      // Top, not bottom: steps differ in height, so a bottom bar moves every
      // time you advance and the mouse has to chase it. Anchored to the top of
      // the deck it stays put.
      deck.prepend(bar)

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

      // Widths change the wrap of the array rows, so the tallest step changes too.
      const onResize = () => equalize()

      prev.addEventListener('click', onPrev)
      next.addEventListener('click', onNext)
      deck.addEventListener('keydown', onKey)
      window.addEventListener('resize', onResize)
      deck.tabIndex = 0

      equalize()
      render()

      teardown.push(() => {
        prev.removeEventListener('click', onPrev)
        next.removeEventListener('click', onNext)
        deck.removeEventListener('keydown', onKey)
        window.removeEventListener('resize', onResize)
        bar.remove()
        steps.forEach((s) => {
          s.classList.remove('is-active')
          s.style.minHeight = ''
        })
        delete deck.dataset.wired
      })
    }

    return () => teardown.forEach((fn) => fn())
  }, [])

  return null
}
