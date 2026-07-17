'use client'

import { useEffect } from 'react'

/**
 * Click any note image to view it full-screen. Delegated listener + an
 * overlay built on demand — the note HTML is build-time generated, so like
 * DemoPlayer/CopyCode this attaches behavior instead of wrapping React
 * components around content it doesn't own.
 *
 * All .prose images on the page form one navigation group (←/→), which makes
 * a :::gallery browsable without the lightbox knowing galleries exist.
 */
export function ImageLightbox() {
  useEffect(() => {
    let overlay: HTMLDivElement | null = null
    let group: HTMLImageElement[] = []
    let index = 0

    const close = () => {
      overlay?.remove()
      overlay = null
      document.removeEventListener('keydown', onKey)
    }

    const render = () => {
      if (!overlay) return
      const img = group[index]
      const big = overlay.querySelector('img')!
      big.src = img.currentSrc || img.src
      big.alt = img.alt
      overlay.querySelector('.lightbox-caption')!.textContent = img.alt || ''
      overlay.querySelector('.lightbox-counter')!.textContent =
        group.length > 1 ? `${index + 1} / ${group.length}` : ''
    }

    const step = (d: number) => {
      index = (index + d + group.length) % group.length
      render()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }

    const open = (img: HTMLImageElement) => {
      group = Array.from(document.querySelectorAll<HTMLImageElement>('.prose img'))
      index = Math.max(0, group.indexOf(img))
      overlay = document.createElement('div')
      overlay.className = 'lightbox'
      overlay.innerHTML =
        '<img alt="" />' +
        '<div class="lightbox-caption"></div>' +
        '<div class="lightbox-counter"></div>' +
        '<button type="button" class="lightbox-close" aria-label="关闭">✕</button>'
      // Click anywhere except the image itself closes; the image toggles zoom.
      overlay.addEventListener('click', (e) => {
        const t = e.target as HTMLElement
        if (t.tagName === 'IMG') t.classList.toggle('is-zoomed')
        else close()
      })
      document.body.appendChild(overlay)
      document.addEventListener('keydown', onKey)
      render()
    }

    const onClick = (e: MouseEvent) => {
      const img = (e.target as HTMLElement).closest?.('.prose img') as HTMLImageElement | null
      if (!img || (e.target as HTMLElement).closest('a')) return // linked images keep their link
      e.preventDefault()
      open(img)
    }

    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('click', onClick)
      close()
    }
  }, [])

  return null
}
