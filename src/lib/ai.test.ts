import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildAnthropicRequest, buildOpenAiRequest, type AiConfig } from './ai'

const ANTHROPIC: AiConfig = { v: 1, provider: 'anthropic', apiKey: 'sk-ant-x', model: 'claude-opus-4-8' }
const OPENAI: AiConfig = {
  v: 1,
  provider: 'openai-compatible',
  apiKey: 'sk-x',
  model: 'qwen3',
  baseUrl: 'http://localhost:11434/v1/',
}
const MSGS = [{ role: 'user' as const, content: 'hi' }]

type CachedBlock = { type: string; text: string; cache_control?: { type: string } }
type AnthropicBody = {
  system?: CachedBlock[]
  max_tokens: number
  messages: { role: string; content: string | CachedBlock[] }[]
}

describe('buildAnthropicRequest', () => {
  it('URL、三件套请求头、默认 max_tokens', () => {
    const r = buildAnthropicRequest(ANTHROPIC, MSGS, { system: 'sys' })
    assert.equal(r.url, 'https://api.anthropic.com/v1/messages')
    assert.equal(r.headers['x-api-key'], 'sk-ant-x')
    assert.equal(r.headers['anthropic-version'], '2023-06-01')
    assert.equal(r.headers['anthropic-dangerous-direct-browser-access'], 'true')
    const b = r.body as AnthropicBody
    assert.equal(b.max_tokens, 4096)
    assert.equal(b.messages.length, 1)
  })

  it('system 与末条消息带 prompt caching 断点', () => {
    const msgs = [
      { role: 'user' as const, content: 'q1' },
      { role: 'assistant' as const, content: 'a1' },
      { role: 'user' as const, content: 'q2' },
    ]
    const b = buildAnthropicRequest(ANTHROPIC, msgs, { system: 'sys' }).body as AnthropicBody
    assert.deepEqual(b.system, [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }])
    // 历史消息保持原样，只有末条转成带断点的块 —— 多轮时上一轮前缀命中缓存
    assert.equal(b.messages[0].content, 'q1')
    assert.equal(b.messages[1].content, 'a1')
    assert.deepEqual(b.messages[2].content, [{ type: 'text', text: 'q2', cache_control: { type: 'ephemeral' } }])
  })

  it('无 system 时不发 system 字段', () => {
    const b = buildAnthropicRequest(ANTHROPIC, MSGS).body as AnthropicBody
    assert.ok(!('system' in b))
  })
})

describe('buildOpenAiRequest', () => {
  it('baseUrl 尾斜杠归一、system 变首条消息', () => {
    const r = buildOpenAiRequest(OPENAI, MSGS, { system: 'sys' })
    assert.equal(r.url, 'http://localhost:11434/v1/chat/completions')
    const b = r.body as { messages: { role: string; content: string }[] }
    assert.equal(b.messages[0].role, 'system')
    assert.equal(b.messages[1].role, 'user')
  })

  it('空 apiKey 不发 Authorization（Ollama 场景）', () => {
    const r = buildOpenAiRequest({ ...OPENAI, apiKey: '' }, MSGS)
    assert.ok(!('Authorization' in r.headers))
    const r2 = buildOpenAiRequest(OPENAI, MSGS)
    assert.equal(r2.headers.Authorization, 'Bearer sk-x')
  })
})
