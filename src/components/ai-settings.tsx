'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import { AI_KEY, chat, readAiConfig, readAiDraft, saveAiConfig, type AiConfig, type AiProvider } from '@/lib/ai'

/**
 * AI provider settings card, same shape as TokenSettings. One JSON blob in
 * localStorage (viki:ai:v1); saves announce themselves with a synthetic
 * StorageEvent so the chat sidebar / brief panel light up immediately.
 *
 * The form renders from the lenient draft reader, NOT readAiConfig — the
 * strict reader returns null while the config is half-filled, and rendering
 * from it would wipe the inputs on every keystroke (fields would only "stick"
 * in one magic order).
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

function useAiDraft(): AiConfig | null {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return useMemo(() => {
    void raw
    return readAiDraft()
  }, [raw])
}

type TestState = { phase: 'idle' } | { phase: 'busy' } | { phase: 'ok'; model: string } | { phase: 'bad'; message: string }

// Haiku by default: brief/chat outputs are 1-2K tokens where Haiku is 1/5 the
// price of Opus and plenty capable — users who want more pick it in the list.
const DEFAULT_MODEL = 'claude-haiku-4-5'
const EMPTY: AiConfig = { v: 1, provider: 'anthropic', apiKey: '', model: DEFAULT_MODEL }

const ANTHROPIC_MODELS = ['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-4-8']
const MODEL_HINTS: Record<string, string> = {
  'claude-haiku-4-5': '快、省钱，推荐',
  'claude-sonnet-5': '均衡',
  'claude-opus-4-8': '最强',
}
const OPENAI_MODEL_SUGGESTIONS = ['qwen3:14b', 'deepseek-chat', 'deepseek-reasoner', 'llama3.1:8b']
const CUSTOM = '__custom__'

const inputCls =
  'mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700'

export function AiSettings() {
  const stored = useAiConfig()
  // Local draft mirrors the stored config; every field change persists — same
  // save-as-you-type behavior as the token card.
  const draft = useAiDraft()
  const cfg = draft ?? EMPTY
  const [test, setTest] = useState<TestState>({ phase: 'idle' })
  // Sticky "自定义" choice: without it, picking custom would snap back to the
  // placeholder as soon as the typed model happens to match nothing/a preset.
  const [customModel, setCustomModel] = useState(false)

  const update = (patch: Partial<AiConfig>) => {
    const next = { ...cfg, ...patch }
    const empty =
      !next.apiKey && !next.baseUrl && (!next.model || next.model === DEFAULT_MODEL) && next.provider === 'anthropic'
    saveAiConfig(empty ? null : next)
    setTest({ phase: 'idle' })
  }

  const configured = !!stored
  const modelSelectValue = customModel || (cfg.model && !ANTHROPIC_MODELS.includes(cfg.model)) ? CUSTOM : cfg.model

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
            onChange={(e) => {
              setCustomModel(false)
              update({ provider: e.target.value as AiProvider })
            }}
            className={`${inputCls} dark:bg-neutral-950`}
          >
            <option value="anthropic">Anthropic（支持浏览器直连）</option>
            <option value="openai-compatible">OpenAI 兼容端点（需自填 baseURL）</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">模型</span>
          {cfg.provider === 'anthropic' ? (
            <>
              <select
                value={modelSelectValue}
                onChange={(e) => {
                  if (e.target.value === CUSTOM) {
                    setCustomModel(true)
                    update({ model: '' })
                  } else {
                    setCustomModel(false)
                    update({ model: e.target.value })
                  }
                }}
                className={`${inputCls} dark:bg-neutral-950`}
              >
                <option value="" disabled>
                  选择模型…
                </option>
                {ANTHROPIC_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}（{MODEL_HINTS[m]}）
                  </option>
                ))}
                <option value={CUSTOM}>自定义…</option>
              </select>
              {modelSelectValue === CUSTOM && (
                <input
                  type="text"
                  value={cfg.model}
                  onChange={(e) => update({ model: e.target.value.trim() })}
                  placeholder="claude-…"
                  className={inputCls}
                />
              )}
            </>
          ) : (
            <>
              <input
                type="text"
                list="viki-openai-model-suggestions"
                value={cfg.model}
                onChange={(e) => update({ model: e.target.value.trim() })}
                placeholder="qwen3:14b"
                className={inputCls}
              />
              <datalist id="viki-openai-model-suggestions">
                {OPENAI_MODEL_SUGGESTIONS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </>
          )}
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">API key{cfg.provider === 'openai-compatible' ? '（本地端点可留空）' : ''}</span>
          <input
            type="password"
            value={cfg.apiKey}
            onChange={(e) => update({ apiKey: e.target.value.replace(/\s+/g, '') })}
            placeholder={cfg.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
            className={inputCls}
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
              className={inputCls}
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
        {draft && (
          <button
            type="button"
            onClick={() => {
              saveAiConfig(null)
              setCustomModel(false)
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
