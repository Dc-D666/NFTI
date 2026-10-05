<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { sendChatMessageStreamWithRetry, type ChatMessage } from '@/services/aiChat'
import { dbSaveAiChat, dbGetAiChat } from '@/services/channelDb'
import { getStoredSession, getGuestSession, getFingerprint } from '@/services/channelAuth'

const emit = defineEmits<{ (e: 'close'): void }>()

const messages = ref<ChatMessage[]>([])
const inputText = ref('')
const isLoading = ref(false)
const errorMsg = ref('')
const messagesContainer = ref<HTMLDivElement | null>(null)

// 组件是否仍挂载（卸载后跳过流式写入）
let isMounted = true
onUnmounted(() => { isMounted = false })

// 安全渲染：先 HTML 转义再转换 markdown，防止 XSS
function renderSafeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

const systemPrompt = `你是南方中学（株洲市南方中学）的一位热心学长/学姐（方小楠），正在帮助新同学了解这所学校。

关于南方中学：
- 株洲市南方中学是湖南省示范性普通高级中学，位于株洲市芦淞区
- 学校历史悠久，校风严谨，活动丰富

关于 NFTI 人格测试：
- NFTI 是"南方中学人格测试"，基于MBTI框架改造的校园人格测试
- 测试有快速版（12题，4种人格）和完整版（48题，16+3种人格）
- 四个维度重新命名：O/R（外向/内向）、G/V（务实/幻想）、L/E（理性/感性）、S/F（结构化/灵活）
- 完整测试还有3种隐藏人格等你发现

回答风格：亲切、幽默、有学长/学姐的感觉。用「你」称呼对方。不要编造不实信息。如果不知道就说不知道。`

const allPresets = [
  'NFTI 测试准不准呀？',
  '完整测试和快速测试有什么区别？',
  '怎么才能测出隐藏人格？',
  '测出的人格类型对我有什么用？',
  'NFTI 和 MBTI 有什么区别？',
  '霍兰德职业测评准吗？',
  'NFTI 和霍兰德结果怎么结合起来看？',
  '测试结果会变吗？',
  '快速测试和完整测试哪个更适合我？',
  '隐藏人格要什么条件才能解锁？',
]
function shufflePick<T>(arr: T[], n: number): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]!
    copy[i] = copy[j]!
    copy[j] = tmp
  }
  return copy.slice(0, n)
}
const presetQuestions = shufflePick(allPresets, 4)

onMounted(() => {
  messages.value.push({
    role: 'assistant',
    content: '嗨，我是方小楠！想了解南方中学或者 NFTI 人格测试？尽管问我吧 😊\n\n你也可以先做个测试（首页有快速/完整测试入口），测完再来找我聊更针对性的话题！',
  })
})

// 保存到 localStorage + 数据库
function persistChat() {
  const history = messages.value.filter(m => m.role !== 'system')
  if (history.length === 0) return
  try { localStorage.setItem('nfti_home_ai_chat', JSON.stringify(history)) } catch {}
  const stored = getStoredSession()
  const guest = getGuestSession()
  const tinyId = stored?.user?.tinyId
  const guestId = guest?.guestId || (!tinyId ? 'fp_' + getFingerprint() : null)
  if (tinyId || guestId) {
    dbSaveAiChat({ tiny_id: tinyId || null, guest_id: guestId || null, messages: history })
      .catch(() => {})
  }
}

onMounted(async () => {
  // 优先从数据库加载
  const stored = getStoredSession()
  if (stored?.user?.tinyId) {
    try {
      const res = await dbGetAiChat(stored.user.tinyId)
      if (res.success && res.data?.messages?.length > 0) {
        messages.value = res.data.messages
        return
      }
    } catch {}
  }
  // fallback localStorage
  try {
    const raw = localStorage.getItem('nfti_home_ai_chat')
    if (raw) {
      const parsed = JSON.parse(raw) as ChatMessage[]
      if (parsed.length > 0) { messages.value = parsed; return }
    }
  } catch {}
})

async function sendMessage(text?: string) {
  const content = text || inputText.value.trim()
  if (!content || isLoading.value) return
  if (!text) inputText.value = ''
  errorMsg.value = ''
  messages.value.push({ role: 'user', content })
  persistChat()
  isLoading.value = true
  await scrollToBottom()
  const assistantIndex = messages.value.length
  messages.value.push({ role: 'assistant', content: '' })
  try {
      const apiMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...messages.value.slice(0, assistantIndex)]
      await sendChatMessageStreamWithRetry(apiMessages, (chunk) => {
      if (!isMounted) return
      const msg = messages.value[assistantIndex]
      if (msg) { msg.content += chunk; scrollToBottom() }
    }, { temperature: 0.7 })
  } catch (err) {
    if (!isMounted) return
    errorMsg.value = err instanceof Error ? err.message : '请求失败，请稍后重试'
    messages.value.splice(assistantIndex, 1)
  } finally { if (!isMounted) return; isLoading.value = false; persistChat(); await scrollToBottom() }
}

async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
}
</script>

<template>
  <div class="ai-chat-overlay" @click.self="emit('close')">
    <div class="ai-chat-modal">
      <div class="chat-header">
        <div class="header-info">
          <div class="header-avatar" aria-hidden="true">
            <img src="/fangxiaonan-avatar.jpg" alt="方小楠" class="avatar-img" />
          </div>
          <div class="header-text">
            <div class="header-title">方小楠</div>
            <div class="header-subtitle">关于南中和NFTI，随便问</div>
          </div>
        </div>
        <div class="header-actions">
          <button class="header-close" @click="emit('close')" aria-label="关闭">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div ref="messagesContainer" class="chat-messages">
        <div v-for="(msg, idx) in messages" :key="idx" class="message" :class="msg.role">
          <div class="message-avatar" v-if="msg.role === 'assistant'" aria-hidden="true">
            <img src="/fangxiaonan-avatar.jpg" alt="方小楠" class="avatar-img" />
          </div>
          <div class="message-bubble">
            <div class="message-content" v-html="renderSafeHtml(msg.content)"></div>
          </div>
        </div>
        <div v-if="isLoading" class="message assistant">
          <div class="message-avatar" aria-hidden="true">
            <img src="/fangxiaonan-avatar.jpg" alt="方小楠" class="avatar-img" />
          </div>
          <div class="message-bubble loading"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
        </div>
        <div v-if="errorMsg" class="chat-error"><span aria-hidden="true">⚠</span> {{ errorMsg }}</div>
      </div>

      <div v-if="messages.length <= 1" class="preset-questions">
        <button v-for="(q, idx) in presetQuestions" :key="idx" class="preset-btn" @click="sendMessage(q)">{{ q }}</button>
      </div>

      <div class="chat-input-area">
        <div class="input-wrapper">
          <textarea v-model="inputText" class="chat-input" placeholder="输入你的问题..." rows="1"
            @keydown="handleKeydown"
            @input="($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = ($event.target as HTMLTextAreaElement).scrollHeight + 'px'"
          ></textarea>
          <button class="send-btn" :class="{ active: inputText.trim() && !isLoading }" @click="sendMessage()" :disabled="!inputText.trim() || isLoading" aria-label="发送">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <div class="input-hint">按 Enter 发送，Shift + Enter 换行</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-chat-overlay {
  position: fixed; inset: 0; background: rgba(19, 19, 31, 0.5); backdrop-filter: blur(12px);
  display: flex; justify-content: center; align-items: flex-end; z-index: 200;
  animation: fadeIn 200ms ease; padding: var(--space-4);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.ai-chat-modal {
  background: var(--color-bg-elevated); border-radius: 24px; max-width: 520px; width: 100%;
  max-height: 85vh; display: flex; flex-direction: column;
  box-shadow: 0 24px 80px rgba(19, 19, 31, 0.25); animation: slideUp 300ms var(--ease-out-expo); overflow: hidden;
}
@keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }

.chat-header { display: flex; justify-content: space-between; align-items: center; padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
.header-info { display: flex; align-items: center; gap: var(--space-3); }
.header-avatar { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 12px; color: var(--color-text-inverse); }
.header-text { display: flex; flex-direction: column; gap: 2px; }
.header-title { font-family: var(--font-display); font-size: 16px; font-weight: 700; color: var(--gray-900); }
.header-subtitle { font-size: 12px; color: var(--gray-400); }
.header-close { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; background: var(--gray-100); border: none; border-radius: 10px; color: var(--gray-500); cursor: pointer; transition: all 150ms ease; }
.header-close:hover { background: var(--gray-200); color: var(--gray-700); }
.header-close:active { transform: scale(0.95); }
.header-actions { display: flex; align-items: center; gap: var(--space-2); }

.chat-messages { flex: 1; overflow-y: auto; padding: var(--space-4) var(--space-5); display: flex; flex-direction: column; gap: var(--space-4); scroll-behavior: smooth; }
.chat-messages::-webkit-scrollbar { width: 4px; }
.chat-messages::-webkit-scrollbar-thumb { background: var(--gray-200); border-radius: 4px; }

.message { display: flex; gap: var(--space-3); align-items: flex-start; animation: messageIn 300ms var(--ease-out-expo); }
@keyframes messageIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.message.user { flex-direction: row-reverse; }
.message-avatar { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 10px;
.avatar-img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; } color: var(--color-text-inverse); flex-shrink: 0; margin-top: 2px; }

.message-bubble { max-width: 75%; padding: var(--space-3) var(--space-4); border-radius: 16px; font-size: 14px; line-height: 1.7; color: var(--gray-700); }
.message.assistant .message-bubble { background: var(--gray-50); border: 1px solid var(--color-border); border-top-left-radius: 4px; }
.message.user .message-bubble { background: linear-gradient(135deg, var(--indigo-500), var(--indigo-600)); color: var(--color-text-inverse); border-top-right-radius: 4px; }
.message-bubble.loading { display: flex; gap: 4px; align-items: center; padding: var(--space-3) var(--space-4); }
.dot { width: 6px; height: 6px; background: var(--gray-400); border-radius: 50%; animation: dotPulse 1.4s ease-in-out infinite; }
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes dotPulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }

.message-content :deep(strong) { font-weight: 700; color: var(--indigo-600); }
.chat-error { text-align: center; padding: var(--space-3); font-size: 13px; color: var(--rose-500); background: var(--rose-50); border-radius: 12px; animation: messageIn 200ms ease; }

.preset-questions { display: flex; flex-wrap: wrap; gap: var(--space-2); padding: 0 var(--space-5) var(--space-3); flex-shrink: 0; }
.preset-btn { font-size: 12px; font-weight: 500; color: var(--indigo-600); background: var(--indigo-50); border: 1px solid var(--indigo-100); border-radius: 100px; padding: 6px 14px; cursor: pointer; transition: all 150ms ease; white-space: nowrap; }
.preset-btn:hover { background: var(--indigo-100); transform: translateY(-1px); }
.preset-btn:active { transform: translateY(0); }

.chat-input-area { padding: var(--space-3) var(--space-5) var(--space-5); border-top: 1px solid var(--color-border); flex-shrink: 0; }
.input-wrapper { display: flex; align-items: flex-end; gap: var(--space-2); background: var(--gray-50); border: 1.5px solid var(--color-border); border-radius: 16px; padding: var(--space-2) var(--space-3); transition: border-color 200ms ease; }
.input-wrapper:focus-within { border-color: var(--indigo-300); }
.chat-input { flex: 1; background: transparent; border: none; font-size: 14px; line-height: 1.5; color: var(--gray-800); resize: none; max-height: 120px; padding: var(--space-1) 0; outline: none; }
.chat-input::placeholder { color: var(--gray-400); }
.send-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; background: var(--gray-200); border: none; border-radius: 12px; color: var(--gray-400); cursor: not-allowed; transition: all 150ms ease; flex-shrink: 0; }
.send-btn.active { background: linear-gradient(135deg, var(--indigo-500), var(--indigo-600)); color: var(--color-text-inverse); cursor: pointer; }
.send-btn.active:hover { box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3); transform: translateY(-1px); }
.send-btn.active:active { transform: translateY(0); }
.input-hint { text-align: center; font-size: 11px; color: var(--gray-400); margin-top: var(--space-2); }

@media (max-width: 480px) {
  .ai-chat-overlay { padding: 0; align-items: flex-end; }
  .ai-chat-modal { max-height: 92vh; border-radius: 20px 20px 0 0; }
  .chat-messages { padding: var(--space-3) var(--space-4); }
  .chat-input-area { padding: var(--space-3) var(--space-4) var(--space-4); }
  .preset-questions { padding: 0 var(--space-4) var(--space-3); }
}
</style>
