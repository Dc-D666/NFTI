<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getCrossAnalysisStream } from '@/services/crossAnalysis'
import { dbGetCrossAnalysis, dbSaveCrossAnalysis } from '@/services/channelDb'
import { getFingerprint } from '@/services/channelAuth'
import type { NftiForCross, HollandForCross } from '@/services/crossAnalysis'

const props = defineProps<{
  nfti: NftiForCross
  holland: HollandForCross
  /** 用户标识（用于缓存查询） */
  userTinyId?: string
  userGuestId?: string
}>()

type CardState = 'idle' | 'loading' | 'streaming' | 'complete' | 'error'
const state = ref<CardState>('idle')
const displayText = ref('')
const errorMsg = ref('')
const cooldown = ref(false)
const dotCount = ref(0)
let dotTimer: ReturnType<typeof setInterval> | null = null
let analysisTimeoutId: ReturnType<typeof setTimeout> | null = null
let cooldownTimer: ReturnType<typeof setTimeout> | null = null

function startDotTimer() {
  dotCount.value = 0
  dotTimer = setInterval(() => { dotCount.value = (dotCount.value + 1) % 4 }, 500)
}
function stopDotTimer() {
  if (dotTimer) { clearInterval(dotTimer); dotTimer = null }
}

// 组件卸载时清理全部定时器，防止泄漏
onUnmounted(() => {
  stopDotTimer()
  if (analysisTimeoutId) { clearTimeout(analysisTimeoutId); analysisTimeoutId = null }
  if (cooldownTimer) { clearTimeout(cooldownTimer); cooldownTimer = null }
})

async function startAnalysis() {
  if (state.value === 'streaming' || cooldown.value) return

    // 先查缓存
  const cacheKey = {
    ...getCacheUserId(),
    nfti_code: props.nfti.typeCode,
    holland_code: props.holland.code,
  }
  try {
    const cached = await dbGetCrossAnalysis(cacheKey)
    if (cached.success && cached.data?.content) {
      displayText.value = cached.data.content
      state.value = 'complete'
      return
    }
  } catch { /* 缓存查失败就调 AI */ }

  state.value = 'loading'
  displayText.value = ''
  errorMsg.value = ''
  startDotTimer()

  // 30秒超时保护：防止请求挂起导致 loading 状态不消失
  analysisTimeoutId = setTimeout(() => {
    if (state.value === 'loading') {
      state.value = 'error'
      stopDotTimer()
      errorMsg.value = '请求超时，请重试'
      startCooldown()
    }
  }, 30000)

  await getCrossAnalysisStream(props.nfti, props.holland, {
    onChunk(text) {
      if (state.value === 'loading') { state.value = 'streaming'; stopDotTimer(); if (analysisTimeoutId) { clearTimeout(analysisTimeoutId); analysisTimeoutId = null } }
      displayText.value = text
    },
    onComplete(fullText) {
      state.value = 'complete'
      stopDotTimer()
      if (analysisTimeoutId) { clearTimeout(analysisTimeoutId); analysisTimeoutId = null }
      startCooldown()
      // 保存到缓存
      const userId = getCacheUserId()
      dbSaveCrossAnalysis({
        ...userId,
        nfti_code: props.nfti.typeCode,
        holland_code: props.holland.code,
        content: fullText,
      }).catch(() => {})
    },
    onError(_err) {
      state.value = 'error'
      stopDotTimer()
      if (analysisTimeoutId) { clearTimeout(analysisTimeoutId); analysisTimeoutId = null }
      errorMsg.value = '分析生成失败，请稍后重试'
      startCooldown()
    },
  })
}

function retry() {
  if (cooldown.value) return
  stopDotTimer()
  startAnalysis()
}

function startCooldown() {
  cooldown.value = true
  cooldownTimer = setTimeout(() => { cooldown.value = false }, 15000)
}

// 解析 markdown-style 标题行（以 emoji + **xxx** 开头），用于给每个段落添加装饰
function renderText(text: string): string {
  return text
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

/**
 * 安全地将 AI 文本渲染为 HTML（仅允许可控的 <strong>/<br>/<div> 标签）
 * 先 HTML 转义再转换 markdown 标记，防止 XSS
 */
function renderSections(text: string): string {
  // 1. HTML 转义（& < > 全部转义，消除所有恶意标签）
  let result = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 2. 安全转换 markdown 标题：emoji + **粗体** → 带样式的标题行
  // 注意：** 不是 HTML 特殊字符，HTML 转义不会影响它们
  // 匹配任意 emoji（U+2600+）后接 **粗体标题** 的行
  const sectionRegex = /([\u{2600}-\u{27BF}\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}])\s*\*\*(.+?)\*\*/gu
  result = result.replace(sectionRegex, (match) => {
    const inner = match.replace(/\*\*(.+?)\*\*/g, '<strong class="section-title">$1</strong>')
    return `<div class="section-head">${inner}</div>`
  })

  // 3. 安全转换内联粗体
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // 4. 换行
  result = result.replace(/\n/g, '<br>')

  return result
}

// 缓存标识：优先 QQ tinyId，其次 guestId，最后浏览器指纹
function getCacheUserId() {
  if (props.userTinyId) return { tiny_id: props.userTinyId }
  if (props.userGuestId) return { guest_id: props.userGuestId }
  return { guest_id: 'fp_' + getFingerprint() }
}

// 页面加载时自动从缓存恢复
onMounted(async () => {
  const cacheKey = {
    ...getCacheUserId(),
    nfti_code: props.nfti.typeCode,
    holland_code: props.holland.code,
  }
  try {
    const cached = await dbGetCrossAnalysis(cacheKey)
    if (cached.success && cached.data?.content) {
      displayText.value = cached.data.content
      state.value = 'complete'
    }
  } catch { /* 静默处理 */ }
})

const nftiName = `${props.nfti.typeCode} · ${props.nfti.typeName}`
const hollandCode = props.holland.code
</script>

<template>
  <div class="ai-cross-card">
    <!-- 头部 -->
    <div class="card-header">
      <span class="header-icon" aria-hidden="true">🔗</span>
      <div class="header-text">
        <span class="header-title">AI 深度交叉分析</span>
        <span class="header-subtitle">
          {{ nftiName }} × 霍兰德 {{ hollandCode }}
        </span>

      </div>
    </div>

    <!-- IDLE 状态：展示预览 + 启动按钮 -->
    <div v-if="state === 'idle'" class="state-idle">
      <div class="idle-preview">
        <div class="preview-avatars">
          <span class="preview-badge nfti-badge">{{ nftiName }}</span>
          <span class="preview-cross">×</span>
          <span class="preview-badge holland-badge">{{ hollandCode }}</span>
        </div>
        <p class="idle-desc">
          基于你的 NFTI 人格得分和霍兰德职业倾向得分，使用 AI 生成个性化的深度交叉分析报告。
        </p>
      </div>
      <button class="start-btn" :class="{ 'is-cooldown': cooldown }" :disabled="cooldown" @click="startAnalysis">
        <span class="start-btn-icon" aria-hidden="true">✨</span>
        {{ cooldown ? '⏳ 等待中...' : '生成交叉分析' }}
      </button>
    </div>

    <!-- LOADING 状态 -->
    <div v-if="state === 'loading'" class="state-loading">
      <div class="loading-spinner">
        <div class="spinner-ring"></div>
      </div>
      <p class="loading-text">
        <span>AI 正在分析你的人格×职业组合{{ '.'.repeat(dotCount) }}</span>
      </p>
    </div>

    <!-- STREAMING 状态 -->
    <div v-if="state === 'streaming'" class="state-streaming">
      <div class="stream-content" v-html="renderSections(displayText)"></div>
      <div class="stream-cursor" aria-hidden="true"></div>
    </div>

    <!-- COMPLETE 状态 -->
    <div v-if="state === 'complete'" class="state-complete">
      <div class="complete-content" v-html="renderSections(displayText)"></div>
      <button class="regenerate-btn" :class="{ 'is-cooldown': cooldown }" :disabled="cooldown" @click="retry">
        {{ cooldown ? '⏳ 等待中...' : '🔄 重新生成' }}
      </button>
    </div>

    <!-- ERROR 状态 -->
    <div v-if="state === 'error'" class="state-error">
      <div class="error-icon" aria-hidden="true">⚠️</div>
      <p class="error-text">分析生成失败</p>
      <p v-if="errorMsg" class="error-detail">{{ errorMsg }}</p>
      <button class="retry-btn" :class="{ 'is-cooldown': cooldown }" :disabled="cooldown" @click="retry">
        {{ cooldown ? '⏳ 等待中...' : '🔄 重试' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ─── 卡片容器 ─── */
.ai-cross-card {
  background: linear-gradient(135deg, var(--indigo-50), var(--amber-50));
  border: 1.5px solid var(--indigo-200);
  border-radius: 20px;
  overflow: hidden;
  transition: box-shadow 200ms;
}

/* ─── 头部 ─── */
.card-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  background: rgba(255, 255, 255, 0.5);
  border-bottom: 1px solid var(--indigo-200);
}

.header-icon {
  font-size: 20px;
  line-height: 1;
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
  color: var(--color-primary);
}

.header-subtitle {
  font-size: 12px;
  color: var(--gray-500);
}



/* ─── IDLE 状态 ─── */
.state-idle {
  padding: var(--space-6) var(--space-5);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
}

.idle-preview {
  text-align: center;
}

.preview-avatars {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.preview-badge {
  font-size: 13px;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 20px;
  letter-spacing: 0.3px;
}

.nfti-badge {
  background: var(--indigo-100);
  color: var(--indigo-800);
}

.holland-badge {
  background: var(--amber-100);
  color: var(--amber-700);
}

.preview-cross {
  font-size: 18px;
  font-weight: 700;
  color: var(--gray-300);
}

.idle-desc {
  font-size: 14px;
  line-height: 1.7;
  color: var(--gray-500);
  max-width: 320px;
  margin: 0 auto;
}

.start-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 12px 28px;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  background: var(--color-primary);
  border: none;
  border-radius: 40px;
  cursor: pointer;
  transition: transform 150ms, box-shadow 150ms;
  box-shadow: 0 2px 8px rgba(78, 65, 49, 0.2);
}

.start-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(78, 65, 49, 0.25);
}

.start-btn:active {
  transform: translateY(0);
}

.start-btn.is-cooldown {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.start-btn-icon {
  font-size: 18px;
}

/* ─── LOADING 状态 ─── */
.state-loading {
  padding: var(--space-8) var(--space-5);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  position: relative;
}

.spinner-ring {
  width: 40px;
  height: 40px;
  border: 3px solid var(--indigo-100);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 14px;
  color: var(--gray-500);
}

/* ─── STREAMING 状态 ─── */
.state-streaming {
  padding: var(--space-5);
  position: relative;
}

.stream-content {
  font-size: 14px;
  line-height: 1.8;
  color: var(--gray-700);
}

.stream-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--color-primary);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: blink 0.8s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

/* ─── COMPLETE 状态 ─── */
.state-complete {
  padding: var(--space-5);
}

.complete-content {
  font-size: 14px;
  line-height: 1.8;
  color: var(--gray-700);
  margin-bottom: var(--space-4);
}

.regenerate-btn {
  display: block;
  margin: 0 auto;
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary);
  background: var(--indigo-50);
  border: 1px solid var(--indigo-200);
  border-radius: 20px;
  cursor: pointer;
  transition: background 150ms;
}

.regenerate-btn:hover {
  background: var(--indigo-100);
}

.regenerate-btn.is-cooldown {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ─── ERROR 状态 ─── */
.state-error {
  padding: var(--space-6) var(--space-5);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  text-align: center;
}

.error-icon {
  font-size: 32px;
  line-height: 1;
}

.error-text {
  font-size: 15px;
  font-weight: 700;
  color: var(--rose-600);
}

.error-detail {
  font-size: 12px;
  color: var(--gray-400);
  max-width: 280px;
}

.retry-btn {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--rose-500);
  border: none;
  border-radius: 20px;
  cursor: pointer;
  transition: background 150ms;
}

.retry-btn:hover {
  background: var(--rose-600);
}

.is-cooldown {
  opacity: 0.6;
  cursor: not-allowed;
}

.is-cooldown:hover {
  opacity: 0.6;
}

/* ─── 通用文本样式 ─── */
:deep(.section-head) {
  margin-top: var(--space-4);
  margin-bottom: var(--space-2);
  padding-left: var(--space-2);
  border-left: 3px solid var(--amber-400);
}

:deep(.section-head:first-child) {
  margin-top: 0;
}

:deep(.section-title) {
  font-family: var(--font-display);
  font-size: 15px;
  color: var(--color-primary);
}

:deep(strong) {
  color: var(--gray-900);
  font-weight: 700;
}

:deep(br) {
  content: '';
  display: block;
  margin: 6px 0;
}
</style>
