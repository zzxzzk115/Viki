'use client'

import { useEffect, useState } from 'react'

interface Pop {
  left: number
  top: number
  text: string
}

/**
 * Makes glossary terms tappable.
 *
 * Terms render as static HTML (in a dangerouslySetInnerHTML note body) with the
 * definition in a `title` attribute. That works on desktop hover but is dead on
 * touch — `title` never shows, so mobile readers cannot see any definition at
 * all. This delegates a document click: tapping a `.term` shows the same text in
 * a positioned popover. Desktop keeps the native hover too; this just adds tap.
 *
 * One listener on document rather than per-term handlers, since terms are
 * injected HTML the component never owns.
 */
export function TermPopover() {
  const [pop, setPop] = useState<Pop | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      const term = target?.closest?.('.term') as HTMLElement | null
      if (!term) {
        setPop(null)
        return
      }
      const title = term.getAttribute('title')
      if (!title) return
      const r = term.getBoundingClientRect()
      // Clamp so a term near the right edge does not overflow the viewport.
      const left = Math.min(r.left, window.innerWidth - 288)
      setPop({ left: Math.max(8, left), top: r.bottom + 6, text: title })
    }
    const onScroll = () => setPop(null)
    document.addEventListener('click', onClick)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  if (!pop) return null
  return (
    <div
      role="tooltip"
      className="fixed z-50 max-w-72 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
      style={{ left: pop.left, top: pop.top }}
    >
      {pop.text}
    </div>
  )
}
