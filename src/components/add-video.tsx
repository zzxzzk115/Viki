'use client'

import { useState } from 'react'
import { TokenQuickSet } from '@/components/token-settings'
import { ghCommitFile, ghLoadFile, readStoredToken } from '@/lib/github-edit'
import { buildVideoNote, parseVideoUrl, videoSlug, type VideoNoteInput, type VideoRef } from '@/lib/video-note'

type State = 'idle' | 'busy' | 'done' | 'exists' | 'error' | 'need-token'

/** YouTube oEmbed (CORS-enabled) → title; Bilibili has none, so caller asks. */
async function youtubeTitle(id: string): Promise<string> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`)
    if (!r.ok) return ''
    const j = (await r.json()) as { title?: string; author_name?: string }
    return j.title ?? ''
  } catch {
    return ''
  }
}

/**
 * 「收藏视频」: paste a YouTube/Bilibili URL → commit a one-video note under
 * content/videos/. Same token→load→dedup→commit flow as AddToBib; the PAT push
 * materializes the note (with embedded player) which you then annotate.
 */
export function AddVideo({ preset }: { preset?: VideoNoteInput }) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  // A video whose title we still need (Bilibili, or a YouTube oEmbed miss).
  const [awaitingTitle, setAwaitingTitle] = useState<VideoRef | null>(null)
  // The full input to re-commit after a token is pasted.
  const [retry, setRetry] = useState<VideoNoteInput | null>(null)
  const [state, setState] = useState<State>('idle')
  const [msg, setMsg] = useState('')
  const [href, setHref] = useState('')

  const commit = async (input: VideoNoteInput) => {
    const token = readStoredToken()
    if (!token) {
      setRetry(input)
      setState('need-token')
      return
    }
    setState('busy')
    const slug = videoSlug(input.title, input.id)
    const path = `content/videos/${slug}.md`
    const file = await ghLoadFile(path, token)
    if (!file.ok) {
      setState('error')
      setMsg(`读取失败 (${file.status})`)
      return
    }
    if (!('isNew' in file)) {
      setState('exists')
      setHref(`/notes/videos/${slug}/`)
      return
    }
    const r = await ghCommitFile(path, buildVideoNote(input), null, `videos: collect ${input.title}`, token)
    if (r.ok) {
      setState('done')
      setHref(`/notes/videos/${slug}/`)
    } else {
      setState('error')
      setMsg(`提交失败 (${r.status}): ${r.message}`)
    }
  }

  // Discovery-feed 收藏 passes a ready preset; the manual form parses a URL.
  const start = async () => {
    if (preset) return commit(preset)
    const ref = parseVideoUrl(url)
    if (!ref) {
      setState('error')
      setMsg('识别不出视频链接（支持 YouTube / Bilibili）')
      return
    }
    setState('busy')
    const auto = ref.platform === 'youtube' ? await youtubeTitle(ref.id) : ''
    if (!auto) {
      // Bilibili (or oEmbed miss): ask for a title.
      setAwaitingTitle(ref)
      setState('idle')
      return
    }
    return commit({ platform: ref.platform, id: ref.id, title: auto })
  }

  if (state === 'done')
    return (
      <span className="text-xs text-emerald-600 dark:text-emerald-400">
        ✓ 已收藏，部署后可在{' '}
        <a href={href} className="underline">
          视频笔记
        </a>{' '}
        里写笔记
      </span>
    )
  if (state === 'exists')
    return (
      <span className="text-xs text-neutral-400">
        已收藏 ·{' '}
        <a href={href} className="underline">
          打开
        </a>
      </span>
    )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!preset && (
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="粘贴 YouTube / Bilibili 链接…"
          className="w-64 rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
        />
      )}
      {awaitingTitle && (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="标题（Bilibili 需手填）"
          className="w-56 rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
        />
      )}
      <button
        type="button"
        disabled={state === 'busy' || (!preset && !url.trim() && !awaitingTitle) || (!!awaitingTitle && !title.trim())}
        onClick={() =>
          awaitingTitle ? commit({ platform: awaitingTitle.platform, id: awaitingTitle.id, title: title.trim() }) : start()
        }
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {state === 'busy' ? '收藏中…' : preset ? '＋ 收藏' : awaitingTitle ? '确认' : '收藏'}
      </button>
      {state === 'error' && <span className="text-xs text-red-600 dark:text-red-400">{msg}</span>}
      {state === 'need-token' && (
        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
          需要 token（仅站主）
          <TokenQuickSet onSaved={() => retry && commit(retry)} />
        </span>
      )}
    </div>
  )
}
