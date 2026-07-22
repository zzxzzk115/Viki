'use client'

import { useEffect, useState } from 'react'

/**
 * 英音/美音朗读 via the browser's Web Speech API — no key, no network, works
 * for any word (daily word and authored vocab alike). Picks an en-GB / en-US
 * voice when the platform has one; falls back to the other English voice.
 */
export function PlayWord({ word }: { word: string }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const check = () => setReady(true)
    check()
    window.speechSynthesis.addEventListener('voiceschanged', check)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', check)
  }, [])

  if (!ready) return null

  const speak = (lang: 'en-GB' | 'en-US') => {
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(word)
    const voices = synth.getVoices()
    // Exact locale first, then any English voice.
    u.voice =
      voices.find((v) => v.lang.replace('_', '-') === lang) ??
      voices.find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2))) ??
      null
    u.lang = lang
    u.rate = 0.9
    synth.speak(u)
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => speak('en-GB')}
        title="英音"
        aria-label={`朗读 ${word}（英音）`}
        className="rounded px-1.5 py-0.5 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
      >
        🔊 英
      </button>
      <button
        type="button"
        onClick={() => speak('en-US')}
        title="美音"
        aria-label={`朗读 ${word}（美音）`}
        className="rounded px-1.5 py-0.5 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
      >
        🔊 美
      </button>
    </span>
  )
}
