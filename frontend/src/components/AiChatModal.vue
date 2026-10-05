<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { sendChatMessageStreamWithRetry, buildSystemPrompt, buildPersonalityContext } from '@/services/aiChat'
import type { ChatMessage } from '@/services/aiChat'
import { useTestStore } from '@/stores/testStore'
import { dbSaveAiChat, dbGetAiChat } from '@/services/channelDb'
import { getStoredSession, getGuestSession, getFingerprint } from '@/services/channelAuth'

const props = defineProps<{
  personalityCode: string
  personalityName: string
  fourLetter?: string
  description: string
  detail: string
  scores: { E: number; I: number; S: number; N: number; T: number; F: number; J: number; P: number }
  mode: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const store = useTestStore()

// 消息列表
const messages = ref<ChatMessage[]>([])
const inputText = ref('')
const isLoading = ref(false)
const errorMsg = ref('')
const messagesContainer = ref<HTMLDivElement | null>(null)

// 组件是否仍挂载（卸载后跳过流式写入，避免写已卸载组件的状态）
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

// 主动保存对话到 localStorage + 数据库
function persistChat() {
  const history = messages.value.filter(m => m.role !== 'system')
  if (history.length === 0) return
  store.saveAiChatHistory(history)
  // 获取用户标识：优先 QQ tiny_id，其次 guest_id，最后指纹
  const stored = getStoredSession()
  const guest = getGuestSession()
  const tinyId = stored?.user?.tinyId
  const guestId = guest?.guestId
  const fpId = tinyId || guestId ? null : 'fp_' + getFingerprint()
  const id = tinyId || guestId || fpId
  if (id) {
    dbSaveAiChat({ tiny_id: tinyId || null, guest_id: guestId || fpId || null, messages: history })
      .catch(() => {})
  }
}

// 预设问题（每次随机取 4 个展示）
const allPresets = [
  '我这个人格类型适合什么学习方法？',
  '我在人际关系中要注意什么？',
  '最近压力很大，该怎么调节？',
  '我和哪种人格类型最合得来？',
  '我这个类型在班级里适合担任什么职务？',
  '怎么和性格相反的人相处？',
  '如何克服拖延症？',
  '我适合参加什么社团？',
  '怎么在考试前调整心态？',
  '我这个类型的隐藏人格是什么？',
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

// 初始化系统消息
const personalityContext = computed(() =>
  buildPersonalityContext(
    props.personalityCode,
    props.personalityName,
    props.fourLetter,
    props.description,
    props.detail,
    props.scores,
    props.mode
  )
)

const systemPrompt = computed(() => buildSystemPrompt(personalityContext.value))

// 将 MBTI 四字母转为 NFTI
function getNftiLetter(fourLetter?: string): string {
  if (!fourLetter) return ''
  const map: Record<string, string> = { E: 'O', I: 'R', S: 'G', N: 'V', T: 'L', F: 'E', J: 'S', P: 'F' }
  return fourLetter.split('').map((l) => map[l] || l).join('')
}

// 加载历史：先数据库，再 localStorage
onMounted(async () => {
  // 尝试从数据库加载
  const user = getStoredSession()?.user
  const guest = getGuestSession()
  const userId = user?.tinyId
  const guestId = guest?.guestId
  if (userId) {
    try {
      const res = await dbGetAiChat(userId)
      if (res.success && res.data?.messages?.length > 0) {
        messages.value = res.data.messages
        return
      }
    } catch { /* fallback to localStorage */ }
  }

  // 数据库无记录，从 localStorage 加载
  const savedHistory = store.loadAiChatHistory()
  if (savedHistory.length > 0) {
    // 恢复历史记录
    messages.value = [...savedHistory]
  } else {
    // 首次打开，显示欢迎消息
    const nfti = getNftiLetter(props.fourLetter) || props.personalityCode
    messages.value.push({
      role: 'assistant',
      content: `嗨，我是方小楠！看到你是 **${props.personalityName}**（${nfti}），我已经准备好帮你解答关于学习、人际、情绪的各种问题了。\n\n你可以直接输入问题，或者点击下方预设问题快速开始。`,
    })
  }
})

// 发送消息（流式输出）
async function sendMessage(text?: string) {
  const content = text || inputText.value.trim()
  if (!content || isLoading.value) return

  // 清空输入
  if (!text) inputText.value = ''
  errorMsg.value = ''

  // 添加用户消息
  messages.value.push({ role: 'user', content })
  persistChat() // 立即保存用户消息
  isLoading.value = true

  await scrollToBottom()

  // 先添加一个空的 assistant 消息，流式填充
  const assistantIndex = messages.value.length
  messages.value.push({ role: 'assistant', content: '' })

  try {
    const apiMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt.value },
      ...messages.value.slice(0, assistantIndex),
    ]

    await sendChatMessageStreamWithRetry(
      apiMessages,
      (chunk) => {
        if (!isMounted) return
        const msg = messages.value[assistantIndex]
        if (msg) {
          msg.content += chunk
          scrollToBottom()
        }
      },
      { temperature: 0.7 }
    )
  } catch (err) {
    if (!isMounted) return
    errorMsg.value = err instanceof Error ? err.message : '请求失败，请稍后重试'
    // 移除空的 assistant 消息
    messages.value.splice(assistantIndex, 1)
  } finally {
    if (!isMounted) return
    isLoading.value = false
    persistChat() // 最终保存（含 AI 回复）
    await scrollToBottom()
  }
}

// 滚动到底部
async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// 处理键盘事件
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}
</script>

<template>
  <div class="ai-chat-overlay" @click.self="emit('close')">
    <div class="ai-chat-modal">
      <!-- 头部 -->
      <div class="chat-header">
        <div class="header-info">
          <div class="header-avatar" aria-hidden="true">
            <img src="/fangxiaonan-avatar.jpg" alt="方小楠" class="avatar-img" />
          </div>
          <div class="header-text">
            <div class="header-title">方小楠</div>
            <div class="header-subtitle">{{ personalityName }} 专属顾问</div>
          </div>
        </div>
        <div class="header-actions">
          <div class="disclaimer-wrap">
            <button class="header-hint" aria-label="免责声明">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              </svg>
            </button>
            <div class="disclaimer-tooltip">
              <p>内容由 AI 生成，仅供参考</p>
              <p>数据来源于频道，回答质量受到频道成员所产出内容的影响</p>
            </div>
          </div>
          <button class="header-close" @click="emit('close')" aria-label="关闭">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- 消息区域 -->
      <div ref="messagesContainer" class="chat-messages">
        <div
          v-for="(msg, idx) in messages"
          :key="idx"
          class="message"
          :class="msg.role"
        >
          <div class="message-avatar" v-if="msg.role === 'assistant'" aria-hidden="true">
            <img src="/fangxiaonan-avatar.jpg" alt="方小楠" class="avatar-img" />
          </div>
          <div class="message-bubble">
            <div class="message-content" v-html="renderSafeHtml(msg.content)"></div>
          </div>
        </div>

        <!-- 加载中 -->
        <div v-if="isLoading" class="message assistant">
          <div class="message-avatar" aria-hidden="true">
            <img src="/fangxiaonan-avatar.jpg" alt="方小楠" class="avatar-img" />
          </div>
          <div class="message-bubble loading">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
        </div>

        <!-- 错误提示 -->
        <div v-if="errorMsg" class="chat-error">
          <span aria-hidden="true">⚠</span> {{ errorMsg }}
        </div>
      </div>

      <!-- 预设问题（仅在无用户消息时显示） -->
      <div v-if="messages.length <= 1" class="preset-questions">
        <button
          v-for="(q, idx) in presetQuestions"
          :key="idx"
          class="preset-btn"
          @click="sendMessage(q)"
        >
          {{ q }}
        </button>
      </div>

      <!-- 输入区域 -->
      <div class="chat-input-area">
        <div class="input-wrapper">
          <textarea
            v-model="inputText"
            class="chat-input"
            placeholder="输入你的问题..."
            rows="1"
            @keydown="handleKeydown"
            @input="($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = ($event.target as HTMLTextAreaElement).scrollHeight + 'px'"
          ></textarea>
          <button
            class="send-btn"
            :class="{ active: inputText.trim() && !isLoading }"
            @click="sendMessage()"
            :disabled="!inputText.trim() || isLoading"
            aria-label="发送"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
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
  position: fixed;
  inset: 0;
  background: rgba(19, 19, 31, 0.5);
  backdrop-filter: blur(12px);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  z-index: 200;
  animation: fadeIn 200ms ease;
  padding: var(--space-4);
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.ai-chat-modal {
  background: var(--color-bg-elevated);
  border-radius: 24px 24px 24px 24px;
  max-width: 520px;
  width: 100%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 80px rgba(19, 19, 31, 0.25);
  animation: slideUp 300ms var(--ease-out-expo);
  overflow: hidden;
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ---- Header ---- */
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.header-info {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.header-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, var(--indigo-500), var(--indigo-600));
  border-radius: 12px;
  color: var(--color-text-inverse);
}
.header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.header-title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  color: var(--gray-900);
}
.header-subtitle {
  font-size: 12px;
  color: var(--gray-400);
}
.header-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--gray-100);
  border: none;
  border-radius: 10px;
  color: var(--gray-500);
  cursor: pointer;
  transition: all 150ms ease;
}
.header-close:hover {
  background: var(--gray-200);
  color: var(--gray-700);
}
.header-close:active {
  transform: scale(0.95);
}
.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.disclaimer-wrap {
  position: relative;
}
.header-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--gray-100);
  border: none;
  border-radius: 10px;
  color: var(--gray-400);
  cursor: help;
  transition: all 150ms ease;
}
.header-hint:hover {
  background: var(--amber-100);
  color: var(--amber-600);
}
.disclaimer-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 220px;
  background: var(--gray-900);
  color: var(--gray-200);
  padding: var(--space-3) var(--space-4);
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.6;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: all 200ms ease;
  z-index: 10;
  pointer-events: none;
}
.disclaimer-tooltip::before {
  content: '';
  position: absolute;
  top: -6px;
  right: 12px;
  width: 12px;
  height: 12px;
  background: var(--gray-900);
  transform: rotate(45deg);
  border-radius: 2px;
}
.disclaimer-tooltip p {
  margin: 0;
}
.disclaimer-tooltip p + p {
  margin-top: var(--space-1);
  color: var(--gray-400);
}
.disclaimer-wrap:hover .disclaimer-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

/* ---- Messages ---- */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  scroll-behavior: smooth;
}
.chat-messages::-webkit-scrollbar {
  width: 4px;
}
.chat-messages::-webkit-scrollbar-thumb {
  background: var(--gray-200);
  border-radius: 4px;
}

.message {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  animation: messageIn 300ms var(--ease-out-expo);
}
@keyframes messageIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.message.user {
  flex-direction: row-reverse;
}

.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.message-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, var(--indigo-500), var(--indigo-600));
  border-radius: 10px;
  color: var(--color-text-inverse);
  flex-shrink: 0;
  margin-top: 2px;
}

.message-bubble {
  max-width: 75%;
  padding: var(--space-3) var(--space-4);
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--gray-700);
}
.message.assistant .message-bubble {
  background: var(--gray-50);
  border: 1px solid var(--color-border);
  border-top-left-radius: 4px;
}
.message.user .message-bubble {
  background: linear-gradient(135deg, var(--indigo-500), var(--indigo-600));
  color: var(--color-text-inverse);
  border-top-right-radius: 4px;
}

.message-bubble.loading {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: var(--space-3) var(--space-4);
}
.dot {
  width: 6px;
  height: 6px;
  background: var(--gray-400);
  border-radius: 50%;
  animation: dotPulse 1.4s ease-in-out infinite;
}
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes dotPulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}

.message-content :deep(strong) {
  font-weight: 700;
  color: var(--indigo-600);
}
.message.user .message-content :deep(strong) {
  color: var(--color-text-inverse);
  opacity: 0.95;
}

/* ---- Error ---- */
.chat-error {
  text-align: center;
  padding: var(--space-3);
  font-size: 13px;
  color: var(--rose-500);
  background: var(--rose-50);
  border-radius: 12px;
  animation: messageIn 200ms ease;
}

/* ---- Preset Questions ---- */
.preset-questions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: 0 var(--space-5) var(--space-3);
  flex-shrink: 0;
}
.preset-btn {
  font-size: 12px;
  font-weight: 500;
  color: var(--indigo-600);
  background: var(--indigo-50);
  border: 1px solid var(--indigo-100);
  border-radius: 100px;
  padding: 6px 14px;
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
}
.preset-btn:hover {
  background: var(--indigo-100);
  transform: translateY(-1px);
}
.preset-btn:active {
  transform: translateY(0);
}

/* ---- Input Area ---- */
.chat-input-area {
  padding: var(--space-3) var(--space-5) var(--space-5);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}
.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  background: var(--gray-50);
  border: 1.5px solid var(--color-border);
  border-radius: 16px;
  padding: var(--space-2) var(--space-3);
  transition: border-color 200ms ease;
}
.input-wrapper:focus-within {
  border-color: var(--indigo-300);
}
.chat-input {
  flex: 1;
  background: transparent;
  border: none;
  font-size: 14px;
  line-height: 1.5;
  color: var(--gray-800);
  resize: none;
  max-height: 120px;
  padding: var(--space-1) 0;
  outline: none;
}
.chat-input::placeholder {
  color: var(--gray-400);
}
.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--gray-200);
  border: none;
  border-radius: 12px;
  color: var(--gray-400);
  cursor: not-allowed;
  transition: all 150ms ease;
  flex-shrink: 0;
}
.send-btn.active {
  background: linear-gradient(135deg, var(--indigo-500), var(--indigo-600));
  color: var(--color-text-inverse);
  cursor: pointer;
}
.send-btn.active:hover {
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
  transform: translateY(-1px);
}
.send-btn.active:active {
  transform: translateY(0);
}
.input-hint {
  text-align: center;
  font-size: 11px;
  color: var(--gray-400);
  margin-top: var(--space-2);
}

/* ---- Responsive ---- */
@media (max-width: 480px) {
  .ai-chat-overlay {
    padding: 0;
    align-items: flex-end;
  }
  .ai-chat-modal {
    max-height: 92vh;
    border-radius: 20px 20px 0 0;
  }
  .chat-messages {
    padding: var(--space-3) var(--space-4);
  }
  .chat-input-area {
    padding: var(--space-3) var(--space-4) var(--space-4);
  }
  .preset-questions {
    padding: 0 var(--space-4) var(--space-3);
  }
}
</style>
