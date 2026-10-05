import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TestMode, UserAnswers, TestResult } from '@/types'
import type { ChatMessage } from '@/services/aiChat'
import { quickQuestions, fullQuestions } from '@/data/questions'
import { getQuickType, getFullType } from '@/data/personalities'
import { dbSaveResult, dbIncrementCounter } from '@/services/channelDb'
import { getStoredSession, getGuestSession } from '@/services/channelAuth'

const STORAGE_KEY_QUICK = 'nfti_quick_progress'
const STORAGE_KEY_FULL = 'nfti_full_progress'
const STORAGE_KEY_AI_CHAT = 'nfti_ai_chat_history'

/** Fisher-Yates 洗牌 */
function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]!
    copy[i] = copy[j]!
    copy[j] = tmp
  }
  return copy
}

/** 生成完整版题目的随机顺序（ID 列表），附加题 149 始终排在末尾 */
function generateShuffledFullIds(): number[] {
  const ids = fullQuestions
    .filter(q => q.id < 149)
    .map(q => q.id)
  const shuffled = shuffleArray(ids)
  shuffled.push(149) // 附加题固定末尾
  return shuffled
}

export const useTestStore = defineStore('test', () => {
  // State
  const mode = ref<TestMode | null>(null)
  const currentPage = ref(1)
  const answers = ref<UserAnswers>({})
  const isComplete = ref(false)
  const result = ref<TestResult | null>(null)
  const aiChatHistory = ref<ChatMessage[]>([])

  // 完整版题目顺序：每次新测试随机打乱
  const shuffledFullIds = ref<number[]>([])
  // 跳过持久化（URL auto 自动答题 / 调试用）：结果不落库、不计数
  const skipPersist = ref(false)

  // 根据模式获取题目数组（debug 模式使用 fullQuestions）
  const activeQuestions = computed(() => {
    if (!mode.value) return []
    if (mode.value === 'quick') return quickQuestions
    // full / debug：使用打乱后的顺序
    if (shuffledFullIds.value.length > 0) {
      return shuffledFullIds.value
        .map(id => fullQuestions.find(q => q.id === id))
        .filter(Boolean) as typeof fullQuestions
    }
    return fullQuestions
  })

  // Computed
  const currentQuestions = computed(() => {
    if (!mode.value) return []
    const qs = activeQuestions.value
    const perPage = 4
    const start = (currentPage.value - 1) * perPage
    return qs.slice(start, start + perPage)
  })

  const totalPages = computed(() => {
    if (!mode.value) return 0
    return Math.ceil(activeQuestions.value.length / 4)
  })

  const progress = computed(() => {
    const qs = activeQuestions.value
    const answered = qs.filter(q => answers.value[q.id] !== undefined).length
    return Math.round((answered / qs.length) * 100)
  })

  const canGoNext = computed(() => {
    return currentQuestions.value.every(q => answers.value[q.id] !== undefined)
  })

  const canGoPrev = computed(() => {
    return currentPage.value > 1
  })

  const isLastPage = computed(() => {
    return currentPage.value >= totalPages.value
  })

  // Actions
  function setMode(newMode: TestMode) {
    // 如果模式没变，不要重置答案（防止路由变化导致数据丢失）
    if (mode.value === newMode) return
    mode.value = newMode
    currentPage.value = 1
    answers.value = {}
    isComplete.value = false
    result.value = null
    // 完整模式：生成随机题目顺序
    if (newMode === 'full' || newMode === 'debug') {
      shuffledFullIds.value = generateShuffledFullIds()
    } else {
      shuffledFullIds.value = []
    }
  }

  function setAnswer(questionId: number, value: number) {
    answers.value[questionId] = value
    saveProgress()
  }

  function nextPage() {
    if (isLastPage.value && canGoNext.value) {
      calculateResult()
    } else if (canGoNext.value) {
      currentPage.value++
      saveProgress()
    }
  }

  function prevPage() {
    if (currentPage.value > 1) {
      currentPage.value--
      saveProgress()
    }
  }

  function calculateResult() {
    if (!mode.value) return
    isComplete.value = true

    // 计算维度得分（排除隐藏题，id >= 149 为隐藏题）
    const scores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 }
    const qs = activeQuestions.value
    let hiddenAnswer: number | null = null

    for (const [qid, val] of Object.entries(answers.value)) {
      const id = Number(qid)
      if (id >= 149) {
        // 隐藏题：记录答案但不计入维度得分
        hiddenAnswer = val
        continue
      }
      const q = qs.find(q => q.id === id)
      if (!q) continue
      const score = val * q.direction
      scores[q.dimension] += score
    }

    // 判定人格类型（debug 模式与 full 模式共用相同逻辑）
    let type
    if (mode.value === 'quick') {
      type = getQuickType({ E: scores.E, I: scores.I, S: scores.S, N: scores.N })
    } else {
      type = getFullType(scores, hiddenAnswer)
    }

    result.value = {
      mode: mode.value,
      type,
      scores,
    }

    // 结果快照进 sessionStorage：刷新/直接访问 /result/:mode 时可恢复
    try {
      sessionStorage.setItem('nfti_result_snapshot', JSON.stringify({ mode: mode.value, result: result.value }))
    } catch { /* ignore */ }

    // 保存测试结果到数据库（debug 模式与自动答题跳过，避免污染统计）
    if (mode.value !== 'debug' && !skipPersist.value) {
      let userTinyId: string | null = null
      let guestId: string | null = null
      const stored = getStoredSession()
      if (stored?.user?.tinyId) {
        userTinyId = stored.user.tinyId
      } else {
        // 游客：用 localStorage 中的 guest ID
        const guest = getGuestSession()
        if (guest) guestId = guest.guestId
      }
      dbSaveResult({
        assessment_type: 'nfti',
        user_id: null,
        tiny_id: userTinyId,
        guest_id: guestId,
        mode: mode.value,
        type_code: type.code,
        type_name: type.name,
        scores,
        answers: Object.values(answers.value),
      }).catch((err) => console.warn('保存测试结果失败:', err))

      // 增加数据库计数器
      dbIncrementCounter().catch((err) => console.warn('计数器增加失败:', err))
    }

    // 清除当前模式的进度（不清另一个模式的未完成进度）
    clearProgress(mode.value)
  }

  function reset() {
    mode.value = null
    currentPage.value = 1
    answers.value = {}
    isComplete.value = false
    result.value = null
    aiChatHistory.value = []
    skipPersist.value = false
    clearProgress()
    clearAiChatHistory()
    try { sessionStorage.removeItem('nfti_result_snapshot') } catch { /* ignore */ }
  }

  /** 从 sessionStorage 恢复结果快照（ResultView 刷新/直达时用） */
  function restoreResultSnapshot(): { mode: TestMode; result: TestResult } | null {
    try {
      const raw = sessionStorage.getItem('nfti_result_snapshot')
      if (!raw) return null
      const data = JSON.parse(raw)
      if (data && data.mode && data.result) {
        mode.value = data.mode
        result.value = data.result
        isComplete.value = true
        return { mode: data.mode, result: data.result }
      }
    } catch { /* ignore */ }
    return null
  }

  // AI 对话历史记录
  function saveAiChatHistory(messages: ChatMessage[]) {
    aiChatHistory.value = messages
    try {
      localStorage.setItem(STORAGE_KEY_AI_CHAT, JSON.stringify(messages))
    } catch {
      console.warn('localStorage 不可用，AI 对话历史仅保存在内存中')
    }
  }

  function loadAiChatHistory(): ChatMessage[] {
    if (aiChatHistory.value.length > 0) return aiChatHistory.value
    try {
      const data = localStorage.getItem(STORAGE_KEY_AI_CHAT)
      if (data) {
        const parsed = JSON.parse(data) as ChatMessage[]
        aiChatHistory.value = parsed
        return parsed
      }
    } catch {
      console.warn('AI 对话历史读取失败')
    }
    return []
  }

  function clearAiChatHistory() {
    aiChatHistory.value = []
    try {
      localStorage.removeItem(STORAGE_KEY_AI_CHAT)
    } catch {
      // ignore
    }
  }

  // localStorage（debug 模式跳过，避免污染正常进度）
  function saveProgress() {
    if (!mode.value || mode.value === 'debug') return
    const key = mode.value === 'quick' ? STORAGE_KEY_QUICK : STORAGE_KEY_FULL
    const data = {
      mode: mode.value,
      currentPage: currentPage.value,
      answers: answers.value,
      shuffledFullIds: shuffledFullIds.value,
      timestamp: Date.now(),
    }
    try {
      localStorage.setItem(key, JSON.stringify(data))
    } catch {
      console.warn('localStorage 不可用，进度仅保存在内存中')
    }
  }

  function loadProgress(): { mode: TestMode; currentPage: number; answers: UserAnswers } | null {
    try {
      const quick = localStorage.getItem(STORAGE_KEY_QUICK)
      const full = localStorage.getItem(STORAGE_KEY_FULL)

      let data = null
      if (quick) data = JSON.parse(quick)
      if (full) {
        const fullData = JSON.parse(full)
        if (!data || (fullData.timestamp > data.timestamp)) {
          data = fullData
        }
      }

      if (data && data.mode) {
        mode.value = data.mode
        currentPage.value = data.currentPage || 1
        answers.value = data.answers || {}
        // 恢复随机题目顺序（兼容旧存档没有此字段的情况）
        if (data.shuffledFullIds && data.shuffledFullIds.length > 0) {
          shuffledFullIds.value = data.shuffledFullIds
        }
        return { mode: data.mode, currentPage: data.currentPage, answers: data.answers }
      }
    } catch {
      console.warn('localStorage 读取失败')
    }
    return null
  }

  /** 清除进度：传 mode 只清该模式的 key；不传清全部（保持旧行为，供 dismissModal 等调用） */
  function clearProgress(mode?: TestMode) {
    try {
      if (mode === 'quick' || mode === 'full') {
        localStorage.removeItem(mode === 'quick' ? STORAGE_KEY_QUICK : STORAGE_KEY_FULL)
      } else {
        localStorage.removeItem(STORAGE_KEY_QUICK)
        localStorage.removeItem(STORAGE_KEY_FULL)
      }
    } catch {
      // ignore
    }
  }

  function hasUnfinishedProgress(): { mode: TestMode; currentPage: number } | null {
    try {
      const quick = localStorage.getItem(STORAGE_KEY_QUICK)
      const full = localStorage.getItem(STORAGE_KEY_FULL)
      // 与 loadProgress 保持一致：双 key 并存时按 timestamp 取最新的，防止续答错模式
      let best: { mode: TestMode; currentPage: number; timestamp: number } | null = null
      if (quick) {
        const data = JSON.parse(quick)
        if (data && data.mode) best = { mode: 'quick', currentPage: data.currentPage || 1, timestamp: data.timestamp || 0 }
      }
      if (full) {
        const data = JSON.parse(full)
        if (data && data.mode && (!best || (data.timestamp || 0) > best.timestamp)) {
          best = { mode: 'full', currentPage: data.currentPage || 1, timestamp: data.timestamp || 0 }
        }
      }
      return best ? { mode: best.mode, currentPage: best.currentPage } : null
    } catch {
      // ignore
    }
    return null
  }

  return {
    mode,
    currentPage,
    answers,
    isComplete,
    result,
    skipPersist,
    currentQuestions,
    totalPages,
    progress,
    canGoNext,
    canGoPrev,
    isLastPage,
    setMode,
    setAnswer,
    nextPage,
    prevPage,
    calculateResult,
    reset,
    restoreResultSnapshot,
    saveProgress,
    loadProgress,
    clearProgress,
    hasUnfinishedProgress,
    aiChatHistory,
    saveAiChatHistory,
    loadAiChatHistory,
    clearAiChatHistory,
  }
})
