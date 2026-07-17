'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import { AI_KEY, chat, readAiConfig, saveAiConfig, type AiConfig, type AiProvider } from '@/lib/ai'

/**
 * AI provider settings card, same shape as TokenSettings. One JSON blob in
 * localStorage (viki:ai:v1); saves announce themselves with a synthetic
 * StorageEvent so the chat sidebar / brief panel light up immediately.
 */

const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}
const getSnapshot = () => {
  try {
    return localStorage.getItem(AI_KEY) ?? ''
  } catch {
    return ''
  }
}
const getServerSnapshot = () => ''

export function useAiConfig(): AiConfig | null {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return useMemo(() => {
    void raw // snapshot only signals change; readAiConfig re-validates
    return readAiConfig()
  }, [raw])
}

type TestState = { phase: 'idle' } | { phase: 'busy' } | { phase: 'ok'; model: string } | { phase: 'bad'; message: string }

const EMPTY: AiConfig = { v: 1, provider: 'anthropic', apiKey: '', model: '' }

export function AiSettings() {
  const stored = useAiConfig()
  // Local draft mirrors the stored config; every field change persists — same
  // save-as-you-type behavior as the token card.
  const cfg = stored ?? EMPTY
  const [test, setTest] = useState<TestState>({ phase: 'idle' })

  const update = (patch: Partial<AiConfig>) => {
    const next = { ...cfg, ...patch }
    saveAiConfig(next.apiKey || next.model || next.baseUrl ? next : null)
    setTest({ phase: 'idle' })
  }

  const configured = !!(stored && stored.apiKey && stored.model && (stored.provider !== 'openai-compatible' || stored.baseUrl))

  return (
    <div className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">AI 助手</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            configured
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
          }`}
        >
          {configured ? '已配置' : '未配置'}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-neutral-500">提供商</span>
          <select
            value={cfg.provider}
            onChange={(e) => update({ provider: e.target.value as AiProvider })}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="anthropic">Anthropic（支持浏览器直连）</option>
            <option value="openai-compatible">OpenAI 兼容端点（需自填 baseURL）</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">模型</span>
          <input
            type="text"
            value={cfg.model}
            onChange={(e) => update({ model: e.target.value.trim() })}
            placeholder={cfg.provider === 'anthropic' ? 'claude-opus-4-8' : 'qwen3:14b'}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
          />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">API key{cfg.provider === 'openai-compatible' ? '（本地端点可留空）' : ''}</span>
          <input
            type="password"
            value={cfg.apiKey}
            onChange={(e) => update({ apiKey: e.target.value.replace(/\s+/g, '') })}
            placeholder={cfg.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
          />
        </label>
        {cfg.provider === 'openai-compatible' && (
          <label className="block">
            <span className="text-xs text-neutral-500">baseURL（该端点必须允许浏览器 CORS）</span>
            <input
              type="text"
              value={cfg.baseUrl ?? ''}
              onChange={(e) => update({ baseUrl: e.target.value.trim() })}
              placeholder="http://localhost:11434/v1"
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
            />
          </label>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs">
        <button
          type="button"
          disabled={!configured || test.phase === 'busy'}
          onClick={async () => {
            if (!stored) return
            setTest({ phase: 'busy' })
            const r = await chat(stored, [{ role: 'user', content: 'ping——只回复 ok' }], { maxTokens: 8 })
            setTest(r.ok ? { phase: 'ok', model: r.model } : { phase: 'bad', message: r.message })
          }}
          className="rounded border border-neutral-300 px-2.5 py-1 text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {test.phase === 'busy' ? '测试中…' : '测试'}
        </button>
        {stored && (
          <button
            type="button"
            onClick={() => {
              saveAiConfig(null)
              setTest({ phase: 'idle' })
            }}
            className="text-neutral-400 underline decoration-dotted underline-offset-2 hover:text-red-600 dark:hover:text-red-400"
          >
            清除
          </button>
        )}
        {test.phase === 'ok' && <span className="text-emerald-600 dark:text-emerald-400">✓ 可用（{test.model}）</span>}
        {test.phase === 'bad' && <span className="text-red-600 dark:text-red-400">✗ {test.message}</span>}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-neutral-500">
        解锁 AI 论文导读与侧边栏助手。key 存在本机浏览器，调用直接从你的浏览器发往提供商——本站没有任何中转服务器。
        注意 OpenAI 官方 API 不允许浏览器直连；「OpenAI 兼容」用于本地 Ollama、DeepSeek 等允许 CORS 的端点。
      </p>
    </div>
  )
}
