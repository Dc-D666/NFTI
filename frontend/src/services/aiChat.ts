// AI 对话服务层 —— 通过后端代理调用 DeepSeek API（API Key 仅在服务端，不暴露到浏览器）
import { nftiSystemPrompt, buildPersonalityContext } from '@/data/knowledgeBase'
import { postWithTimeout } from './channelDb'

const PROXY_BASE = '/api'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatOptions {
  temperature?: number
  maxTokens?: number
}

// 构建完整的 system prompt（知识库 + 用户人格上下文）
export function buildSystemPrompt(personalityContext: string): string {
  return `${nftiSystemPrompt}\n\n---\n\n【当前用户上下文】\n${personalityContext}\n\n请基于以上用户的人格类型和校园背景，给出个性化建议。`
}

// 发送对话请求（非流式）
export async function sendChatMessage(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const { temperature = 0.7, maxTokens = 2048 } = options

  let session: string | undefined
  try {
    const raw = localStorage.getItem('nfti_channel_session')
    if (raw) { const d = JSON.parse(raw); if (d.sessionId) session = d.sessionId }
  } catch {}

  const response = await postWithTimeout(PROXY_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'ai-proxy',
      session,
      params: {
        messages,
        stream: false,
        model: 'deepseek-v4-flash',
        temperature,
        max_tokens: maxTokens,
        thinking: { type: 'disabled' },
      },
    }),
  }, 30000)

  const data = await response.json()
  if (!data.success) throw new Error(data.error || 'API 请求失败')

  const content = data.data?.choices?.[0]?.message?.content
  if (!content) throw new Error('API 返回内容为空')

  return content
}

// 带重试的聊天请求（非流式）
export async function sendChatMessageWithRetry(
  messages: ChatMessage[],
  options?: ChatOptions,
  maxRetries = 2
): Promise<string> {
  let lastError: Error | null = null

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await sendChatMessage(messages, options)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (i < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)))
      }
    }
  }

  throw lastError || new Error('请求失败，请稍后重试')
}

// 流式输出：发送请求并通过回调逐字接收内容
export async function sendChatMessageStream(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  options: ChatOptions = {}
): Promise<void> {
  const { temperature = 0.7, maxTokens = 2048 } = options

  let session: string | undefined
  try {
    const raw = localStorage.getItem('nfti_channel_session')
    if (raw) { const d = JSON.parse(raw); if (d.sessionId) session = d.sessionId }
  } catch {}

  // 流式超时保护：无数据推进超过 45s 或总时长超过 120s 则中止
  const controller = new AbortController()
  let lastDataAt = Date.now()
  const idleTimer = setInterval(() => {
    if (Date.now() - lastDataAt > 45000) controller.abort()
  }, 5000)
  const maxTimer = setTimeout(() => controller.abort(), 120000)

  try {
    const response = await postWithTimeout(PROXY_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'ai-proxy',
        session,
        params: {
          messages,
          stream: true,
          model: 'deepseek-v4-flash',
          temperature,
          max_tokens: maxTokens,
          thinking: { type: 'disabled' },
        },
      }),
      signal: controller.signal,
    }, 120000)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`)
    }

    if (!response.body) {
      throw new Error('响应体为空')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value && value.length > 0) lastDataAt = Date.now()

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          if (!trimmed.startsWith('data: ')) continue

          try {
            const jsonStr = trimmed.slice(6)
            const json = JSON.parse(jsonStr)
            const delta = json.choices?.[0]?.delta?.content
            if (delta) {
              onChunk(delta)
            }
          } catch {
            // 忽略解析失败的行
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  } finally {
    // 无论成功/失败/中止，都清理超时看门狗
    clearInterval(idleTimer)
    clearTimeout(maxTimer)
  }
}

// 带重试的流式请求
export async function sendChatMessageStreamWithRetry(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  options?: ChatOptions,
  maxRetries = 2
): Promise<void> {
  let lastError: Error | null = null

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await sendChatMessageStream(messages, onChunk, options)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (i < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)))
      }
    }
  }

  throw lastError || new Error('请求失败，请稍后重试')
}

export { buildPersonalityContext }
