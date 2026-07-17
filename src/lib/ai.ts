/**
 * Provider-agnostic LLM chat for the browser. Plain fetch, no SDK — one
 * non-streaming call spoken in two protocols doesn't justify a dependency,
 * and keeping it fetch-only mirrors github-edit.ts (a Node script can
 * exercise the same builders against real APIs).
 *
 * Provider reality on a static site (no proxy to hide behind):
 * - Anthropic officially supports direct browser calls via the
 *   `anthropic-dangerous-direct-browser-access` header.
 * - OpenAI's official API sends no CORS headers, so browsers cannot call it;
 *   the 'openai-compatible' provider is for endpoints that DO allow CORS
 *   (local Ollama, DeepSeek-style providers, self-hosted proxies).
 *
 * No streaming, deliberately: a brief/draft is 1-2K output tokens and only
 * usable once complete (merge/validation runs on the whole text), so SSE
 * parsing would buy latency theater and nothing else.
 */

export type AiProvider = 'anthropic' | 'openai-compatible'

export interface AiConfig {
  v: 1
  provider: AiProvider
  apiKey: string
  model: string
  /** Only for openai-compatible, e.g. http://localhost:11434/v1 */
  baseUrl?: string
}

export const AI_KEY = 'viki:ai:v1'

/**
 * Strict read: null unless the config is actually usable for a chat() call —
 * anthropic needs an API key, openai-compatible needs a baseURL (key optional,
 * local endpoints run without auth). Feature surfaces (sidebar, brief panel)
 * key off this.
 */
export function readAiConfig(): AiConfig | null {
  const d = readAiDraft()
  if (!d || !d.model) return null
  if (d.provider === 'openai-compatible' ? !d.baseUrl : !d.apiKey) return null
  return d
}

/**
 * Lenient read for the settings form: returns whatever partial draft is
 * stored, so a half-filled card survives the save-as-you-type round trip.
 * (The strict reader returning null mid-fill used to wipe the inputs on
 * every keystroke, which made field order matter when it shouldn't.)
 */
export function readAiDraft(): AiConfig | null {
  try {
    const d = JSON.parse(localStorage.getItem(AI_KEY) ?? 'null') as Partial<AiConfig> | null
    if (d?.v !== 1) return null
    return {
      v: 1,
      provider: d.provider === 'openai-compatible' ? 'openai-compatible' : 'anthropic',
      apiKey: typeof d.apiKey === 'string' ? d.apiKey : '',
      model: typeof d.model === 'string' ? d.model : '',
      ...(typeof d.baseUrl === 'string' && d.baseUrl ? { baseUrl: d.baseUrl } : {}),
    }
  } catch {
    return null
  }
}

export function saveAiConfig(cfg: AiConfig | null): void {
  try {
    if (cfg) localStorage.setItem(AI_KEY, JSON.stringify(cfg))
    else localStorage.removeItem(AI_KEY)
  } catch {}
  // Same channel as the GitHub token: synthetic StorageEvent for same-tab listeners.
  window.dispatchEvent(new StorageEvent('storage', { key: AI_KEY }))
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type ChatResult =
  | { ok: true; text: string; model: string }
  /** status 0 = fetch threw (network, or the endpoint doesn't allow CORS). */
  | { ok: false; status: number; message: string }

export interface ChatOptions {
  system?: string
  maxTokens?: number
}

interface BuiltRequest {
  url: string
  headers: Record<string, string>
  body: unknown
}

/** Pure and unit-tested — the fetch wrapper below adds nothing but transport. */
export function buildAnthropicRequest(cfg: AiConfig, messages: ChatMessage[], opts?: ChatOptions): BuiltRequest {
  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: {
      model: cfg.model,
      max_tokens: opts?.maxTokens ?? 4096,
      ...(opts?.system ? { system: opts.system } : {}),
      messages,
    },
  }
}

export function buildOpenAiRequest(cfg: AiConfig, messages: ChatMessage[], opts?: ChatOptions): BuiltRequest {
  const base = (cfg.baseUrl ?? '').replace(/\/+$/, '')
  return {
    url: `${base}/chat/completions`,
    headers: {
      'content-type': 'application/json',
      // Empty key stays off the wire: Ollama and friends need no auth, and an
      // empty Bearer makes some gateways 401 what would otherwise work.
      ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: {
      model: cfg.model,
      max_tokens: opts?.maxTokens ?? 4096,
      messages: [...(opts?.system ? [{ role: 'system', content: opts.system }] : []), ...messages],
    },
  }
}

export async function chat(cfg: AiConfig, messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult> {
  // A pasted key with a newline in it makes fetch throw before sending —
  // catch it here with a message that doesn't blame the network.
  if (cfg.apiKey && !/^[\x21-\x7E]+$/.test(cfg.apiKey)) {
    return { ok: false, status: 0, message: 'API key 里混入了空格/换行或非 ASCII 字符——重新完整复制一次' }
  }
  if (cfg.provider === 'openai-compatible' && !cfg.baseUrl) {
    return { ok: false, status: 0, message: 'OpenAI 兼容端点需要填 baseURL' }
  }

  const req =
    cfg.provider === 'anthropic'
      ? buildAnthropicRequest(cfg, messages, opts)
      : buildOpenAiRequest(cfg, messages, opts)

  let r: Response
  try {
    r = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) })
  } catch {
    return {
      ok: false,
      status: 0,
      message: '连不上 API——网络问题，或该端点不允许浏览器跨域（OpenAI 官方 API 不支持浏览器直连）',
    }
  }

  if (!r.ok) {
    let message = `HTTP ${r.status}`
    try {
      const j = (await r.json()) as { error?: { message?: string } }
      // Both protocols put it at error.message.
      if (j.error?.message) message = `${message}: ${j.error.message}`
    } catch {}
    return { ok: false, status: r.status, message }
  }

  try {
    const j = (await r.json()) as {
      // anthropic
      content?: { type: string; text?: string }[]
      stop_reason?: string
      // openai
      choices?: { message?: { content?: string } }[]
      model?: string
    }
    if (cfg.provider === 'anthropic') {
      if (j.stop_reason === 'refusal') return { ok: false, status: r.status, message: '模型拒绝了这个请求' }
      const text = (j.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('')
      return { ok: true, text, model: j.model ?? cfg.model }
    }
    const text = j.choices?.[0]?.message?.content ?? ''
    return { ok: true, text, model: j.model ?? cfg.model }
  } catch {
    return { ok: false, status: r.status, message: '响应不是预期的 JSON 形状' }
  }
}
