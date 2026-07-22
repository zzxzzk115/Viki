'use client'

import { useEffect, useRef } from 'react'
import type { VideoRef } from '@/lib/schema'

/**
 * Embedded player for a video note. iframe-only — no API key, and GitHub Pages
 * has no CSP blocking third-party frames. YouTube uses the privacy-enhanced
 * nocookie host; Bilibili uses its official player iframe.
 *
 * Timestamp seeking: any `@mm:ss` (or `@h:mm:ss`) in the note body becomes a
 * clickable link (rewired here after mount, since the body is build-time HTML).
 * YouTube seeks live via the IFrame API postMessage; Bilibili has no seek API,
 * so its timestamp reloads the player at `&t=<seconds>`.
 */
export function VideoEmbed({ video }: { video: VideoRef }) {
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const seek = (seconds: number) => {
      const frame = frameRef.current
      if (!frame) return
      if (video.platform === 'youtube') {
        // IFrame API command over postMessage (enablejsapi=1 on the src).
        frame.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'seekTo', args: [seconds, true] }),
          '*',
        )
      } else {
        const u = new URL(frame.src)
        u.searchParams.set('t', String(seconds))
        frame.src = u.toString()
      }
      frame.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    // Rewire @mm:ss timestamps in the note body into seek links.
    const article = frameRef.current?.closest('article')
    const wired: HTMLElement[] = []
    if (article) {
      const walker = document.createTreeWalker(
        article.querySelector('.prose') ?? article,
        NodeFilter.SHOW_TEXT,
      )
      const texts: Text[] = []
      for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text)
      for (const t of texts) {
        const m = t.nodeValue?.match(/@(\d{1,2}:)?\d{1,2}:\d{2}/)
        if (!m || !t.parentElement) continue
        const parts = t.nodeValue!.split(/(@(?:\d{1,2}:)?\d{1,2}:\d{2})/g)
        const frag = document.createDocumentFragment()
        for (const part of parts) {
          if (/^@(\d{1,2}:)?\d{1,2}:\d{2}$/.test(part)) {
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.className = 'ts-seek'
            btn.textContent = part
            btn.addEventListener('click', () => seek(toSeconds(part.slice(1))))
            frag.appendChild(btn)
            wired.push(btn)
          } else if (part) {
            frag.appendChild(document.createTextNode(part))
          }
        }
        t.parentElement.replaceChild(frag, t)
      }
    }
    return () => wired.forEach((b) => b.remove())
  }, [video.platform])

  const src =
    video.platform === 'youtube'
      ? `https://www.youtube-nocookie.com/embed/${video.id}?enablejsapi=1`
      : `https://player.bilibili.com/player.html?bvid=${video.id}&autoplay=0&high_quality=1`

  return (
    <div className="video-embed mt-6">
      <iframe
        ref={frameRef}
        src={src}
        title="视频"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  )
}

/** "1:23" or "1:02:03" → seconds. */
function toSeconds(ts: string): number {
  const parts = ts.split(':').map(Number)
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}
