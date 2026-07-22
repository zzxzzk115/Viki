'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * 英音/美音朗读. Prefers real UK/US mp3s when the caller has them (the daily
 * word carries dictionaryapi.dev audio); otherwise the browser's Web Speech
 * API, which works for any word without a key.
 *
 * The Web Speech path never goes silent: if the platform has no en-GB voice
 * (common on Windows), the British button speaks with whatever English voice
 * exists rather than forcing lang='en-GB' and producing nothing — the earlier
 * bug the reader hit.
 */
export function PlayWord({ word, audioUk, audioUs }: { word: string; audioUk?: string; audioUs?: string }) {
  const [ready, setReady] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const hasSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window
    if (!hasSpeech && !audioUk && !audioUs) return
    setReady(true)
    if (!hasSpeech) return
    const check = () => setReady(true)
    window.speechSynthesis.addEventListener('voiceschanged', check)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', check)
  }, [audioUk, audioUs])

  if (!ready) return null

  const play = (lang: 'en-GB' | 'en-US', audio?: string) => {
    if (audio) {
      audioRef.current?.pause()
      const a = new Audio(audio)
      audioRef.current = a
      void a.play().catch(() => speak(lang))
      return
    }
    speak(lang)
  }

  const speak = (lang: 'en-GB' | 'en-US') => {
    if (!('speechSynthesis' in window)) return
    const synth = window.speechSynthesis
    synth.cancel()
    const voices = synth.getVoices()
    const norm = (l: string) => l.replace('_', '-').toLowerCase()
    const voice =
      voices.find((v) => norm(v.lang) === lang.toLowerCase()) ??
      voices.find((v) => norm(v.lang).startsWith('en')) ??
      voices[0] ??
      null
    const u = new SpeechSynthesisUtterance(word)
    // Match lang to the chosen voice so a missing locale doesn't silence it.
    if (voice) {
      u.voice = voice
      u.lang = voice.lang
    } else {
      u.lang = lang
    }
    u.rate = 0.9
    synth.speak(u)
  }

  const btn =
    'rounded px-1.5 py-0.5 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200'

  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" onClick={() => play('en-GB', audioUk)} title="英音" aria-label={`朗读 ${word}（英音）`} className={btn}>
        🔊 英
      </button>
      <button type="button" onClick={() => play('en-US', audioUs)} title="美音" aria-label={`朗读 ${word}（美音）`} className={btn}>
        🔊 美
      </button>
    </span>
  )
}
