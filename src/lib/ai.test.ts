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

describe('buildAnthropicRequest', () => {
  it('URL、三件套请求头、system 顶层字段、默认 max_tokens', () => {
    const r = buildAnthropicRequest(ANTHROPIC, MSGS, { system: 'sys' })
    assert.equal(r.url, 'https://api.anthropic.com/v1/messages')
    assert.equal(r.headers['x-api-key'], 'sk-ant-x')
    assert.equal(r.headers['anthropic-version'], '2023-06-01')
    assert.equal(r.headers['anthropic-dangerous-direct-browser-access'], 'true')
    const b = r.body as { system?: string; max_tokens: number; messages: unknown[] }
    assert.equal(b.system, 'sys')
    assert.equal(b.max_tokens, 4096)
    assert.equal(b.messages.length, 1)
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
