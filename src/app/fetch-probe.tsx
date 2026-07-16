'use client'

import { useEffect, useState } from 'react'
import { BASE, withBase } from '@/lib/base-path'

/**
 * P0 smoke test: proves a runtime fetch of a /public asset resolves under basePath.
 * This is the exact path cards.json and search.json will take later, so if it works
 * here it works for them. Delete once /cards exercises the same path for real.
 */
export function FetchProbe() {
  const [status, setStatus] = useState<'pending' | 'ok' | 'fail'>('pending')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    const url = withBase('/probe.json')
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(() => {
        setStatus('ok')
        setDetail(url)
      })
      .catch((e: unknown) => {
        setStatus('fail')
        setDetail(`${url} — ${e instanceof Error ? e.message : String(e)}`)
      })
  }, [])

  const color =
    status === 'ok'
      ? 'text-emerald-600 dark:text-emerald-400'
      : status === 'fail'
        ? 'text-red-600 dark:text-red-400'
        : 'text-neutral-400'

  return (
    <p className={`font-mono text-sm ${color}`}>
      {status === 'pending' && '… 正在探测 fetch + basePath'}
      {status === 'ok' && `✓ fetch(withBase()) 正常 — ${detail}`}
      {status === 'fail' && `✗ fetch 失败 — ${detail}`}
      <span className="ml-2 text-neutral-400">(basePath = {BASE || '<空>'})</span>
    </p>
  )
}
