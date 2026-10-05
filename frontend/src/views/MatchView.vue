<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ChannelAuthModal from '@/components/ChannelAuthModal.vue'
import {
  getStoredSession, savePendingMatchCode, getPendingMatchCode, clearPendingMatchCode, clearSession, publishShare,
} from '@/services/channelAuth'
import {
  shareRedeem, shareMatch, matchAi, dbGetResults,
  type ShareRedeemResult, type MatchResultData,
} from '@/services/channelDb'
import {
  getMatchTitle, getMatchLevel, getRareCombo, getActivityRecommendations,
} from '@/data/matchRules'

const route = useRoute()
const router = useRouter()

type Stage = 'guide' | 'need-login' | 'unlocked' | 'matching' | 'result' | 'error'

const stage = ref<Stage>('guide')
const errorMsg = ref('')

const shareInfo = ref<ShareRedeemResult['share'] | null>(null)
const myResults = ref<Array<{ id: string; type_code: string; type_name: string; scores: Record<string, number>; assessment_type?: string; created_at: string }>>([])
const selectedResultId = ref('')
const matchResult = ref<MatchResultData | null>(null)
/** 配对结果持久化 ID（分享结果链接用） */
const matchShareId = ref('')
const aiStory = ref('')
const aiLoading = ref(false)
const aiFailed = ref(false)

// ─── 阶段：URL 直达（分享链接自动解锁） ───
const routeCode = computed(() => {
  const raw = route.query.code
  const value = Array.isArray(raw) ? raw[0] : raw
  return String(value || '').toUpperCase().trim()
})

// URL 中的分享码已经是标准格式，仅做归一化（去空格/小写转大写）
// 粘贴完整分享链接或纯分享码均可，自动提取其中的分享码
function normalizeCode(raw: string): string {
  const text = String(raw || '').trim()
  let target = text
  if (/^https?:\/\//i.test(text) || text.includes('/') || text.includes('?code=')) {
    const urlMatch = text.match(/[A-Za-z2-9]{2}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}/)
    if (urlMatch) target = urlMatch[0]
  }
  return target.toUpperCase().replace(/[\s-]/g, '').replace(/^([A-Z2-9]{2})([A-Z2-9]{4})([A-Z2-9]{4})$/, '$1-$2-$3')
}

function validCode(code: string): boolean {
  return /^[A-Z]{2}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)
}

// 引导页：粘贴分享链接提交（链接无效时给出明显提示）
const codeInput = ref('')
async function submitLink() {
  if (!codeInput.value.trim()) return
  const code = normalizeCode(codeInput.value)
  if (!validCode(code)) {
    errorMsg.value = '链接不对，请粘贴完整的分享链接（形如 …/match?code=XXXX-XXXX）'
    return
  }
  errorMsg.value = ''
  await startFlow(codeInput.value)
}

async function startFlow(rawCode: string) {
  errorMsg.value = '' // 清理跨阶段残留提示
  const code = normalizeCode(rawCode)
  if (!validCode(code)) {
    // 链接无效或未带分享参数：引导页 + 提示
    errorMsg.value = '分享链接无效，请粘贴完整的分享链接'
    stage.value = 'guide'
    return
  }
  const stored = getStoredSession()
  if (!stored?.sessionId) {
    // 未登录：暂存分享码，引导登录后自动继续
    savePendingMatchCode(code)
    stage.value = 'need-login'
    return
  }
  await unlock(code)
}

async function unlock(code: string) {
  stage.value = 'matching'
  errorMsg.value = ''
  try {
    const res = await shareRedeem(code)
    if (!res.success || !res.share) {
      // 本地会话失效（后端 403）：清理并引导重新登录，避免死循环
      if (res.error === '请先登录') {
        savePendingMatchCode(code)
        clearSession()
        stage.value = 'need-login'
        errorMsg.value = '登录状态已失效，请重新登录后自动继续'
        return
      }
      stage.value = 'error'
      errorMsg.value = res.error || '分享链接无效'
      return
    }
    shareInfo.value = res.share
    // 加载我的测试结果供选择（失败降级为空列表，不阻塞解锁展示）
    const stored = getStoredSession()
    let list: any[] = []
    try {
      const myRes = await dbGetResults(undefined, stored?.user?.tinyId, undefined)
      list = (myRes?.data || []).filter((r: any) => r.tiny_id === stored?.user?.tinyId && r.mode !== 'debug')
    } catch { /* 降级：无结果可选，提示先测试 */ }
    myResults.value = list
    // 默认选最新一条（与对方同类型优先，其次最新）
    const sameType = list.find((r: any) => (r.assessment_type || 'nfti') === res.share!.assessment_type)
    selectedResultId.value = (sameType || list[0])?.id || ''
    stage.value = 'unlocked'
  } catch (e: any) {
    stage.value = 'error'
    errorMsg.value = e?.message || '解锁失败，请重试'
  }
}

async function handleAuthSuccess() {
  const pending = getPendingMatchCode() || routeCode.value
  clearPendingMatchCode()
  if (pending) await unlock(pending)
  else stage.value = 'guide'
}

// 登录弹窗关闭：仅当还停在登录阶段才回引导页。
// ChannelAuthModal 在 success 后 2 秒还会自动 emit('close')，
// 此时 stage 可能已进入 unlocked/result，绝不能重置（否则解锁结果被清掉）。
function onAuthClose() {
  if (stage.value === 'need-login') stage.value = 'guide'
}

// 游客模式：默契度必须登录（分享链接绑定 QQ 账号）。
// 卸载登录弹窗回到引导页并显示提示——停留在 need-login 会让模态冻结在"等待授权"，
// 且提示渲染在遮罩后面不可见（复审确认）。
function onGuestClose() {
  errorMsg.value = '默契度配对需要登录 QQ 频道账号（游客结果无法生成分享链接），请点击右上角登录'
  stage.value = 'guide'
}

function goTest() {
  // 引导页：无对方信息，去首页选择测试
  router.push('/')
}

async function doMatch() {
  if (!selectedResultId.value || !shareInfo.value) return
  stage.value = 'matching'
  aiStory.value = ''
  aiFailed.value = false
  try {
    const res = await shareMatch(shareInfo.value.code, selectedResultId.value)
    if (!res.success || !res.match) {
      stage.value = 'error'
      errorMsg.value = res.error || '配对失败，请重试'
      return
    }
    matchResult.value = res.match
    matchShareId.value = res.match_id || ''
    stage.value = 'result'
    // 预加载 AI 剧本（失败不阻塞结果展示）
    loadAiStory()
  } catch (e: any) {
    stage.value = 'error'
    errorMsg.value = e?.message || '配对失败，请重试'
  }
}

async function loadAiStory() {
  if (!shareInfo.value || !selectedResultId.value) return
  aiLoading.value = true
  try {
    const res = await matchAi(shareInfo.value.code, selectedResultId.value)
    if (res.success && res.ai_story) aiStory.value = res.ai_story
    else aiFailed.value = true
  } catch {
    aiFailed.value = true
  } finally {
    aiLoading.value = false
  }
}

// ─── 结果展示辅助 ───
const titleResult = computed(() => {
  if (!matchResult.value || !shareInfo.value) return null
  const mine = myResults.value.find(r => r.id === selectedResultId.value)
  return getMatchTitle(shareInfo.value.result.type_code, mine?.type_code || '')
})

const levelInfo = computed(() => matchResult.value ? getMatchLevel(matchResult.value.level) : null)
const rareCombo = computed(() => {
  if (!matchResult.value || !shareInfo.value) return null
  const mine = myResults.value.find(r => r.id === selectedResultId.value)
  return getRareCombo(shareInfo.value.result.type_code, mine?.type_code || '')
})
const activities = computed(() => matchResult.value ? getActivityRecommendations(matchResult.value.data) : [])

// NFTI 四维条
const nftiDims = computed(() => {
  const d = matchResult.value?.data?.dims
  if (!d) return []
  return [
    { label: '社交电量', key: 'social', value: d.social?.harmony ?? 0 },
    { label: '信息偏好', key: 'info', value: d.info?.harmony ?? 0 },
    { label: '决策风格', key: 'decision', value: d.decision?.harmony ?? 0 },
    { label: '生活节奏', key: 'rhythm', value: d.rhythm?.harmony ?? 0 },
  ]
})

// 对方结果分数条（防御非数字）
const ownerBars = computed(() => {
  const s = shareInfo.value?.result.scores || {}
  const keys = Object.keys(s)
  const nums = Object.values(s).map(Number).filter(Number.isFinite)
  const max = Math.max(...nums, 1)
  return keys.map(k => {
    const v = Number(s[k])
    const safe = Number.isFinite(v) ? v : 0
    return { label: k, value: safe, pct: Math.max(5, Math.round((Math.abs(safe) / max) * 100)) }
  })
})

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}

const copiedLink = ref(false)
// 复制配对结果链接（/match/result/:id，点开直接看结果），不是配对码邀请链接
async function copyLink() {
  if (!matchShareId.value) return
  await copyText(window.location.origin + '/match/result/' + matchShareId.value)
  copiedLink.value = true
  setTimeout(() => (copiedLink.value = false), 2000)
}

// 分享结果至 QQ 频道（图片卡片 + 文字 + 发布弹窗，与 NFTI/Holland 分享一致）
const publishingChannel = ref(false)
const channelError = ref('')
const resultShareCardRef = ref<HTMLDivElement | null>(null)
const publishModal = ref(false)
const publishStatus = ref<'progress' | 'success' | 'failed'>('progress')
const publishSteps = ref<{ step: number; text: string; status: string }[]>([])
const publishFeedUrl = ref('')
async function publishToChannel() {
  const stored = getStoredSession()
  if (!stored?.sessionId) { channelError.value = '需要登录 QQ 频道账号才能发布'; return }
  if (!matchShareId.value || !matchResult.value || !shareInfo.value) { channelError.value = '配对结果未就绪'; return }
  publishingChannel.value = true
  channelError.value = ''
  publishModal.value = true
  publishStatus.value = 'progress'
  publishFeedUrl.value = ''
  publishSteps.value = [
    { step: 1, text: '生成结果卡片中...', status: 'in_progress' },
    { step: 2, text: '连接服务器中...', status: 'pending' },
    { step: 3, text: '发布中...', status: 'pending' },
  ]
  try {
    const mine = myResults.value.find(r => r.id === selectedResultId.value)
    const title = getMatchTitle(shareInfo.value.result.type_code, mine?.type_code || '').title
    const text = [
      `我和${shareInfo.value.owner_nick || 'TA'}的默契度：${title}，${matchResult.value.score}分（${getMatchLevel(matchResult.value.level).name}）💞`,
      `结果：${window.location.origin}/match/result/${matchShareId.value}`,
      `你也来测测你和朋友的默契 → ${window.location.origin}/match`,
    ].join('\n')
    // 步骤 1：生成结果卡片图片（失败降级纯文本，不影响发布）
    let imageBase64 = ''
    if (resultShareCardRef.value) {
      try {
        await document.fonts.ready
        const { toCanvas } = await import('dom-to-image-more')
        const canvas = await toCanvas(resultShareCardRef.value, { scale: 3 })
        imageBase64 = canvas.toDataURL('image/png')
      } catch (err) {
        console.warn('[publishToChannel] card image failed:', err)
      }
    }
    publishSteps.value[0] = { step: 1, text: '生成结果卡片中...', status: 'done' }
    publishSteps.value[1] = { step: 2, text: '连接服务器中...', status: 'in_progress' }
    await new Promise(r => setTimeout(r, 300))
    publishSteps.value[1] = { step: 2, text: '连接服务器中...', status: 'done' }
    publishSteps.value[2] = { step: 3, text: '发布中...', status: 'in_progress' }
    const res = await publishShare(stored.sessionId, text, imageBase64 || undefined)
    if (res.success) {
      publishFeedUrl.value = res.feedUrl || ''
      publishSteps.value[2] = { step: 3, text: '发布中...', status: 'done' }
      publishStatus.value = 'success'
    } else {
      publishSteps.value[2] = { step: 3, text: '❌ ' + (res.error || '发送失败'), status: 'failed' }
      publishStatus.value = 'failed'
    }
  } catch (e: any) {
    publishSteps.value[2] = { step: 3, text: '❌ ' + (e?.message || '网络错误'), status: 'failed' }
    publishStatus.value = 'failed'
  } finally {
    publishingChannel.value = false
  }
}

// 解析 AI 剧本两段（宽松降级）
function parseAiStory(story: string): { story: string; reverse: string } {
  const idx = story.indexOf('【TA眼中的你】')
  if (idx >= 0) {
    const head = story.slice(0, idx).replace(/【默契剧本】/g, '').trim()
    const tail = story.slice(idx + '【TA眼中的你】'.length).trim()
    return { story: head, reverse: tail }
  }
  return { story: story.replace(/【默契剧本】/g, '').trim(), reverse: '' }
}

const parsedStory = computed(() => {
  const s = aiStory.value
  if (!s) return { story: '', reverse: '' }
  // 优先用结构化解析，失败走宽松解析
  const m = s.match(/【默契剧本】([\s\S]*?)(?:【TA眼中的你】([\s\S]*))?$/)
  if (m && m[1]) return { story: m[1].trim(), reverse: (m[2] || '').trim() }
  return parseAiStory(s)
})

// ─── 微信聊天记录风格：解析 AI 对话体剧本 ───
interface ChatMsg { speaker: 'a' | 'b'; text: string }
interface ChatScript { messages: ChatMsg[]; reverse: string }

/** 解析对话体（每行「人格A: xxx」）；非对话体（旧缓存叙述）返回 null 供降级 */
function parseChatScript(story: string): ChatScript | null {
  const m = story.match(/【默契剧本】([\s\S]*?)(?:【TA眼中的你】([\s\S]*))?$/)
  const head = m && m[1] ? m[1] : parseAiStory(story).story
  const reverse = (m && m[2] ? m[2] : '').trim()
  const messages: ChatMsg[] = []
  for (const raw of head.split('\n')) {
    const line = raw.trim()
    const mm = line.match(/^(人格A|人格B)\s*[:：]\s*(.+)$/)
    if (mm && mm[1] && mm[2]) messages.push({ speaker: mm[1] === '人格A' ? 'a' : 'b', text: mm[2].trim() })
  }
  if (messages.length >= 2) return { messages, reverse }
  return null
}

const chatScript = computed<ChatScript | null>(() => {
  const s = aiStory.value
  if (!s) return null
  return parseChatScript(s)
})

// 双方昵称与头像（a=分享者=对方，b=我）
const chatANick = computed(() => shareInfo.value?.owner_nick || 'TA')
const chatBNick = computed(() => getStoredSession()?.user?.nickname || '我')
// 我的昵称（duo 卡片对称展示用）
const myNickname = computed(() => getStoredSession()?.user?.nickname || '我')

// 头像色板：项目暖棕 + 琥珀 + 玫瑰 主题色（替代彩虹色）
const AVATAR_COLORS = ['#4D4031', '#6E5F48', '#9C8B6A', '#BBA888', '#f59e0b', '#d97706', '#b45309', '#e11d48', '#fb7185', '#78716c']
function chatAvatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]!
}
function chatAvatarChar(name: string): string {
  return (name || '?').charAt(0).toUpperCase()
}

onMounted(() => {
  if (routeCode.value) {
    // URL 直达优先，清掉可能残留的 pending（避免下次在首页登录被旧分享码跳转）
    clearPendingMatchCode()
    startFlow(routeCode.value)
  } else if (getPendingMatchCode()) {
    startFlow(getPendingMatchCode()!)
  }
})
</script>

<template>
  <div class="match-page">
    <div class="match-content">
    <div class="match-header">
      <button class="back-btn" @click="router.push('/')">← 返回首页</button>
      <h1 class="match-title">💞 默契度测试</h1>
    </div>

    <!-- 阶段：引导（无分享链接直达时） -->
    <div v-if="stage === 'guide'" class="card guide-card">
      <div class="guide-icon">💞</div>
      <h2 class="guide-title">和 TA 测默契度</h2>
      <p class="guide-desc">粘贴朋友的分享链接，看看你们俩有多默契</p>
      <p v-if="errorMsg" class="guide-error">⚠️ {{ errorMsg }}</p>
      <div class="input-row">
        <input
          v-model="codeInput"
          class="code-input"
          placeholder="粘贴分享链接"
          maxlength="200"
          @keyup.enter="submitLink"
        />
        <button class="btn-primary" :disabled="!codeInput.trim()" @click="submitLink">解锁</button>
      </div>
      <p class="guide-sub">还没测过？先测一份，生成你的专属分享链接</p>
      <button class="btn-ghost" @click="router.push('/')">回首页</button>
    </div>

    <!-- 阶段：需要登录 -->
    <div v-if="stage === 'need-login'" class="card">
      <p class="input-desc">默契度配对需要登录 QQ 频道账号，登录后自动继续</p>
      <p v-if="errorMsg" class="login-tip">🔒 {{ errorMsg }}</p>
      <ChannelAuthModal @success="handleAuthSuccess" @close="onAuthClose" @guest="onGuestClose" />
    </div>

    <!-- 阶段：已解锁，选择我的结果 -->
    <div v-if="stage === 'unlocked' && shareInfo" class="content">
      <!-- 自己的分享链接提示 -->
      <div v-if="shareInfo.is_own" class="own-tip">
        ⚠️ 这是<b>你自己的</b>分享链接——把它发给朋友，TA 才能和你配对默契度
      </div>
      <div class="card partner-card">
        <div class="partner-badge">对方的结果</div>
        <h2 class="partner-name">{{ shareInfo.owner_nick || '神秘同学' }}</h2>
        <p class="partner-type">{{ shareInfo.result.type_name }} · {{ shareInfo.result.type_code }}</p>
        <div class="bars">
          <div v-for="b in ownerBars" :key="b.label" class="bar-row">
            <span class="bar-label">{{ b.label }}</span>
            <div class="bar-track"><div class="bar-fill" :style="{ width: b.pct + '%' }"></div></div>
          </div>
        </div>
      </div>

      <div class="card mine-card">
        <h3>选择你的结果来配对</h3>
        <p v-if="!myResults.length" class="empty-tip">
          你还没做过测试，<button class="link-btn" @click="goTest">先去做一份</button>
        </p>
        <div v-else class="result-list">
          <label
            v-for="r in myResults"
            :key="r.id"
            class="result-option"
            :class="{ selected: selectedResultId === r.id }"
          >
            <input v-model="selectedResultId" type="radio" :value="r.id" class="sr-only" />
            <span class="option-type">{{ r.type_name }}</span>
            <span class="option-code">{{ r.type_code }}</span>
            <span class="option-date">{{ (r.created_at || '').slice(0, 10) }}</span>
          </label>
        </div>
        <button class="btn-primary big" :disabled="!selectedResultId" @click="doMatch">开始算默契度</button>
      </div>
    </div>

    <!-- 阶段：计算中 -->
    <div v-if="stage === 'matching'" class="card loading-card">
      <div class="spinner"></div>
      <p>正在解读你们的关系...</p>
    </div>

    <!-- 阶段：错误 -->
    <div v-if="stage === 'error'" class="card error-card">
      <p class="error-msg">😵 {{ errorMsg }}</p>
      <button class="btn-primary" @click="router.push('/')">回首页</button>
    </div>

    <!-- 阶段：结果 -->
    <div v-if="stage === 'result' && matchResult && shareInfo" class="content result-content">
      <!-- 分数大卡 -->
      <div class="score-card" :class="levelInfo?.key">
        <div class="score-big">{{ matchResult.score }}</div>
        <div class="score-label">默契度</div>
        <div class="level-badge">{{ levelInfo?.emoji }} {{ levelInfo?.name }}</div>
        <div v-if="titleResult" class="combo-title">{{ titleResult.title }}</div>
        <div v-if="titleResult?.reversed" class="combo-sub">（TA 视角）</div>
        <p class="level-desc">{{ levelInfo?.desc }}</p>
      </div>

      <!-- 稀有彩蛋 -->
      <div v-if="rareCombo" class="rare-card">
        <span class="rare-badge">{{ rareCombo.rarity === 'legendary' ? '👑 传说组合' : '🐱 隐藏款聚会' }}</span>
        <p>{{ rareCombo.tip }}</p>
      </div>

      <!-- 双方 -->
      <div class="duo-row">
        <div class="duo-card">
          <span class="duo-role">对方</span>
          <b>{{ shareInfo.owner_nick || '神秘同学' }}</b>
          <span>{{ shareInfo.result.type_name }}</span>
        </div>
        <div class="duo-heart">💞</div>
        <div class="duo-card">
          <span class="duo-role">你</span>
          <b>{{ myNickname }}</b>
          <span>{{ myResults.find(r => r.id === selectedResultId)?.type_name }}</span>
        </div>
      </div>

      <!-- 四维契合（NFTI） -->
      <div v-if="nftiDims.length" class="card">
        <h3 class="card-title">四维契合度</h3>
        <div v-for="d in nftiDims" :key="d.key" class="bar-row">
          <span class="bar-label">{{ d.label }}</span>
          <div class="bar-track"><div class="bar-fill" :style="{ width: d.value + '%' }"></div></div>
          <span class="bar-num">{{ d.value }}</span>
        </div>
      </div>

      <!-- AI 剧本 -->
      <div class="card ai-card">
        <h3 class="card-title">🤖 南中关系剧本</h3>
        <div v-if="aiLoading" class="ai-loading"><div class="spinner small"></div> AI 学长正在写小剧场...</div>

        <!-- 微信聊天记录风格（对话体） -->
        <template v-else-if="chatScript">
          <div class="chat-window">
            <div class="chat-header">{{ chatANick }} 和 {{ chatBNick }} 的聊天记录</div>
            <div class="chat-body">
              <div
                v-for="(msg, i) in chatScript.messages"
                :key="i"
                class="chat-row"
                :class="msg.speaker === 'a' ? 'left' : 'right'"
              >
                <div
                  class="chat-avatar"
                  :style="{ background: chatAvatarColor(msg.speaker === 'a' ? chatANick : chatBNick) }"
                >{{ chatAvatarChar(msg.speaker === 'a' ? chatANick : chatBNick) }}</div>
                <div class="chat-bubble" :class="msg.speaker === 'a' ? 'from-a' : 'from-b'">{{ msg.text }}</div>
              </div>
            </div>
            <div class="chat-footer">✨ AI 模拟的聊天记录，仅供娱乐</div>
          </div>
          <div v-if="chatScript.reverse" class="ai-reverse">
            <span class="ai-reverse-label">TA 眼中的你</span>
            <p>{{ chatScript.reverse }}</p>
          </div>
        </template>

        <!-- 旧格式叙述体降级 -->
        <template v-else-if="parsedStory.story">
          <p class="ai-story">{{ parsedStory.story }}</p>
          <div v-if="parsedStory.reverse" class="ai-reverse">
            <span class="ai-reverse-label">TA 眼中的你</span>
            <p>{{ parsedStory.reverse }}</p>
          </div>
        </template>

        <p v-else class="ai-fallback">
          {{ aiFailed ? 'AI 学长今天卡壳了，但默契是真的。' : '加载中...' }}
        </p>
      </div>

      <!-- 适合一起做的事 -->
      <div class="card">
        <h3 class="card-title">🎯 适合一起做的事</h3>
        <ul class="activity-list">
          <li v-for="(a, i) in activities" :key="i">{{ a }}</li>
        </ul>
      </div>

      <!-- 分享（复制结果链接 + 分享结果至频道） -->
      <div class="share-actions">
        <button class="btn-primary" @click="copyLink">{{ copiedLink ? '已复制 ✓' : '🔗 复制结果链接' }}</button>
        <button class="btn-ghost" :disabled="publishingChannel" @click="publishToChannel">
          {{ publishingChannel ? '发布中...' : '📢 分享结果至频道' }}
        </button>
      </div>
      <p v-if="channelError" class="channel-error">😵 {{ channelError }}</p>
    </div>

    <!-- 结果分享卡（屏幕外，生成图片用，与 NFTI/Holland 分享卡片风格一致） -->
    <div ref="resultShareCardRef" class="share-card-offscreen" v-if="matchResult && shareInfo">
      <div class="share-card-inner">
        <div class="share-brand-bar">
          <span class="share-brand-mark">NFTI</span>
          <span class="share-brand-divider"></span>
          <span class="share-brand-tag">你是哪种南方人？</span>
        </div>
        <div class="share-card-hero">
          <div class="share-combo">{{ titleResult?.title }}</div>
          <div class="share-level">{{ levelInfo?.emoji }} {{ levelInfo?.name }}</div>
          <div class="share-score">{{ matchResult.score }}</div>
          <div class="share-score-label">默契度</div>
        </div>
        <div class="share-duo">
          <div class="share-duo-item">
            <b>{{ chatANick }}</b>
            <span>{{ shareInfo.result.type_name }}</span>
          </div>
          <div class="share-duo-heart">💞</div>
          <div class="share-duo-item">
            <b>{{ myNickname }}</b>
            <span>{{ myResults.find(r => r.id === selectedResultId)?.type_name }}</span>
          </div>
        </div>
        <div class="share-foot">和 TA 有多默契？来测 → nfti.weaxi.cn</div>
      </div>
    </div>
    </div>

    <!-- 发布弹窗（复刻 ShareModal：步骤进度 + 成功后跳转查看帖子） -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="publishModal" class="publish-overlay">
          <div class="publish-sheet">
            <template v-if="publishStatus === 'progress' || publishStatus === 'failed'">
              <h3 class="publish-title">📢 正在分享结果</h3>
              <div class="publish-steps">
                <div v-for="s in publishSteps" :key="s.step" class="publish-step" :class="s.status">
                  <span class="publish-step-icon">
                    <span v-if="s.status === 'done'">✅</span>
                    <span v-else-if="s.status === 'failed'">❌</span>
                    <span v-else-if="s.status === 'in_progress'" class="pub-spinner"></span>
                    <span v-else class="pub-pending">○</span>
                  </span>
                  <span class="publish-step-text">{{ s.text }}</span>
                </div>
              </div>
              <button v-if="publishStatus === 'failed'" class="publish-close-btn" @click="publishModal = false">关闭</button>
            </template>
            <template v-else>
              <div class="publish-success">
                <div class="success-icon-big">✅</div>
                <h3 class="publish-title" style="margin-bottom: 8px;">发布成功！</h3>
                <p class="publish-success-desc">你的配对结果已分享至 NFTI 版块</p>
                <div class="publish-actions">
                  <a v-if="publishFeedUrl" :href="publishFeedUrl" target="_blank" class="publish-btn primary">查看帖子</a>
                  <button class="publish-btn secondary" @click="publishModal = false">返回</button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* 页面根全宽（与其他页面一致），内容宽度由 .match-content 控制 */
.match-page {
  min-height: 100vh;
  background: linear-gradient(180deg, var(--brown-50, #FBF8F3) 0%, #fff 100%);
  color: var(--brown-900, #1F1813);
}
.match-content {
  max-width: 560px;
  margin: 0 auto;
  padding: 16px 20px 60px;
}
.match-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.back-btn { background: none; border: 1px solid var(--brown-200, #E4DDCD); border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 13px; color: var(--brown-700, #4D4031); }
.match-title { font-size: 22px; font-weight: 700; margin: 0; }
.card { background: #fff; border: 1px solid var(--brown-100, #F0EBE0); border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 2px 12px rgba(31, 24, 19, 0.04); }
.input-desc { color: var(--brown-600, #524739); margin-bottom: 16px; font-size: 14px; }
.guide-card { text-align: center; padding: 40px 24px; }
.guide-icon { font-size: 44px; margin-bottom: 12px; }
.guide-title { font-size: 20px; font-weight: 700; margin: 0 0 12px; }
.guide-desc { color: var(--brown-600, #524739); font-size: 14px; line-height: 1.7; margin: 0 0 16px; }
.guide-error { color: var(--rose-500, #f43f5e); font-size: 13px; margin: 0 0 12px; font-weight: 500; }
.guide-sub { font-size: 12px; color: var(--brown-400, #9C8B6A); margin: 14px 0 4px; }
.guide-actions { display: flex; gap: 10px; justify-content: center; margin-top: 18px; flex-wrap: wrap; }
.input-row { display: flex; gap: 10px; }
.code-input { flex: 1; padding: 12px 14px; border: 1px solid var(--brown-200, #E4DDCD); border-radius: 10px; font-size: 16px; letter-spacing: 2px; font-family: monospace; outline: none; }
.code-input:focus { border-color: var(--amber-500, #f59e0b); }
.hint { font-size: 12px; color: var(--brown-400, #9C8B6A); margin-top: 10px; }
.btn-primary { background: var(--brown-700, #4D4031); color: #fff; border: none; border-radius: 10px; padding: 12px 22px; cursor: pointer; font-size: 15px; font-weight: 600; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary.big { width: 100%; margin-top: 16px; padding: 14px; }
.btn-ghost { background: none; border: 1px solid var(--brown-200, #E4DDCD); border-radius: 10px; padding: 12px 18px; cursor: pointer; font-size: 14px; color: var(--brown-700, #4D4031); }
.partner-badge { display: inline-block; background: var(--amber-100, #fef3c7); color: var(--amber-700, #b45309); font-size: 12px; padding: 3px 10px; border-radius: 999px; margin-bottom: 8px; }
.partner-name { font-size: 20px; margin: 4px 0; }
.partner-type { color: var(--brown-500, #9C8B6A); font-size: 13px; margin-bottom: 12px; }
.bars { display: flex; flex-direction: column; gap: 6px; }
.bar-row { display: flex; align-items: center; gap: 8px; }
.bar-label { width: 64px; font-size: 12px; color: var(--brown-600, #524739); }
.bar-track { flex: 1; height: 8px; background: var(--brown-100, #F0EBE0); border-radius: 999px; overflow: hidden; }
.bar-fill { height: 100%; background: linear-gradient(90deg, var(--amber-400, #fbbf24), var(--amber-500, #f59e0b)); border-radius: 999px; transition: width 0.6s ease; }
.bar-num { font-size: 12px; color: var(--brown-500, #9C8B6A); width: 26px; text-align: right; }
.mine-card h3, .card-title { margin: 0 0 12px; font-size: 16px; }
.empty-tip { color: var(--brown-500, #9C8B6A); font-size: 14px; }
.link-btn { background: none; border: none; color: var(--amber-600, #d97706); cursor: pointer; font-size: 14px; text-decoration: underline; }
.result-list { display: flex; flex-direction: column; gap: 8px; }
.result-option { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--brown-100, #F0EBE0); border-radius: 10px; cursor: pointer; }
.result-option.selected { border-color: var(--amber-400, #fbbf24); background: var(--amber-50, #fffbeb); }
.option-type { font-weight: 600; font-size: 14px; }
.option-code { font-size: 12px; color: var(--brown-400, #9C8B6A); }
.option-date { margin-left: auto; font-size: 11px; color: var(--brown-300, #D8CFBE); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.loading-card { text-align: center; padding: 60px 20px; }
.spinner { width: 32px; height: 32px; border: 3px solid var(--brown-100, #F0EBE0); border-top-color: var(--amber-500, #f59e0b); border-radius: 50%; margin: 0 auto 16px; animation: spin 0.8s linear infinite; }
.spinner.small { width: 16px; height: 16px; border-width: 2px; margin: 0; display: inline-block; vertical-align: middle; }
@keyframes spin { to { transform: rotate(360deg); } }
.error-card { text-align: center; }
.error-msg { margin-bottom: 16px; }
.score-card { text-align: center; padding: 32px 20px; border-radius: 20px; background: linear-gradient(135deg, var(--brown-700, #4D4031), var(--brown-800, #2E2219)); color: #fff; margin-bottom: 16px; }
.score-big { font-size: 64px; font-weight: 800; line-height: 1; background: linear-gradient(90deg, var(--amber-300, #fcd34d), var(--amber-500, #f59e0b)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.score-label { font-size: 13px; color: var(--brown-300, #D8CFBE); margin: 4px 0 8px; letter-spacing: 4px; }
.level-badge { display: inline-block; background: var(--amber-500, #f59e0b); color: var(--brown-900, #1F1813); font-weight: 700; padding: 5px 16px; border-radius: 999px; font-size: 15px; margin-bottom: 10px; }
.combo-title { font-size: 22px; font-weight: 800; margin-top: 8px; }
.combo-sub { font-size: 12px; color: var(--brown-300, #D8CFBE); }
.level-desc { font-size: 13px; color: var(--brown-200, #E4DDCD); margin-top: 10px; }
.rare-card { background: linear-gradient(135deg, #7c2d12, #b45309); color: #fff; border-radius: 14px; padding: 14px 18px; margin-bottom: 16px; text-align: center; }
.rare-badge { font-size: 13px; font-weight: 700; }
.rare-card p { margin: 6px 0 0; font-size: 14px; }
.duo-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 16px; }
.duo-card { flex: 1; background: #fff; border: 1px solid var(--brown-100, #F0EBE0); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.duo-role { font-size: 11px; color: var(--brown-400, #9C8B6A); }
.duo-card b { font-size: 15px; }
.duo-card span:last-child { font-size: 12px; color: var(--brown-500, #9C8B6A); }
.duo-heart { font-size: 22px; }
.ai-story { font-size: 15px; line-height: 1.7; color: var(--brown-800, #2E2219); white-space: pre-wrap; }

/* ── 微信聊天记录风格（主题色：暖棕 + 琥珀金） ── */
.chat-window { border-radius: 14px; overflow: hidden; border: 1px solid var(--brown-100, #F0EBE0); }
.chat-header { background: var(--brown-100, #F0EBE0); color: var(--brown-600, #524739); font-size: 12px; text-align: center; padding: 8px; border-bottom: 1px solid var(--brown-200, #E4DDCD); }
.chat-body { background: var(--brown-50, #FBF8F3); padding: 12px 10px; display: flex; flex-direction: column; gap: 10px; max-height: 420px; overflow-y: auto; }
.chat-row { display: flex; align-items: flex-start; gap: 8px; }
.chat-row.right { flex-direction: row-reverse; }
.chat-avatar { width: 34px; height: 34px; border-radius: 50%; flex: none; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 14px; font-weight: 700; }
.chat-bubble { max-width: 72%; padding: 9px 12px; font-size: 14px; line-height: 1.55; word-break: break-word; white-space: pre-wrap; }
.chat-bubble.from-a { background: var(--brown-100, #F0EBE0); color: var(--brown-800, #2E2219); border-radius: 12px 12px 12px 4px; }
.chat-bubble.from-b { background: var(--amber-400, #fbbf24); color: var(--brown-900, #1F1813); border-radius: 12px 12px 4px 12px; }
.chat-footer { background: var(--brown-100, #F0EBE0); color: var(--brown-400, #9C8B6A); font-size: 11px; text-align: center; padding: 6px; border-top: 1px solid var(--brown-200, #E4DDCD); }
.ai-reverse { margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--brown-100, #F0EBE0); }
.ai-reverse-label { display: inline-block; font-size: 12px; background: var(--rose-100, #ffe4e6); color: var(--rose-600, #e11d48); padding: 2px 10px; border-radius: 999px; margin-bottom: 8px; }
.ai-reverse p { font-size: 14px; line-height: 1.6; color: var(--brown-700, #4D4031); white-space: pre-wrap; }
.ai-loading { color: var(--brown-400, #9C8B6A); font-size: 13px; }
.ai-fallback { color: var(--brown-400, #9C8B6A); font-size: 13px; }
.activity-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; }
.activity-list li { font-size: 14px; color: var(--brown-700, #4D4031); }
.share-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
.channel-error { font-size: 13px; color: var(--rose-500, #f43f5e); margin-top: 12px; }
/* 结果分享卡（生成图片用，屏幕外不可见） */
.share-card-offscreen { position: fixed; left: -9999px; top: 0; width: 360px; pointer-events: none; z-index: -1; }
.share-card-inner { background: linear-gradient(160deg, #2E2219, #4D4031); border-radius: 18px; padding: 22px; color: #fff; font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif; }
.share-brand-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.share-brand-mark { font-weight: 800; font-size: 16px; letter-spacing: 1px; color: #FBBF24; }
.share-brand-divider { width: 1px; height: 12px; background: rgba(255,255,255,0.3); }
.share-brand-tag { font-size: 11px; color: rgba(255,255,255,0.7); }
.share-card-hero { text-align: center; padding: 12px 0 18px; }
.share-combo { font-size: 20px; font-weight: 800; color: #FCD34D; margin-bottom: 6px; }
.share-level { display: inline-block; background: #F59E0B; color: #1F1813; font-size: 12px; font-weight: 700; padding: 3px 12px; border-radius: 999px; margin-bottom: 12px; }
.share-score { font-size: 64px; font-weight: 800; line-height: 1; color: #FBBF24; }
.share-score-label { font-size: 12px; letter-spacing: 6px; color: rgba(255,255,255,0.6); margin-top: 4px; }
.share-duo { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 0; border-top: 1px solid rgba(255,255,255,0.15); border-bottom: 1px solid rgba(255,255,255,0.15); }
.share-duo-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.share-duo-item b { font-size: 15px; }
.share-duo-item span { font-size: 11px; color: rgba(255,255,255,0.7); }
.share-duo-heart { font-size: 20px; }
.share-foot { text-align: center; font-size: 11px; color: rgba(255,255,255,0.6); padding-top: 14px; }

/* ── 发布弹窗（复刻 ShareModal 风格） ── */
.publish-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; }
.publish-sheet { background: #fff; border-radius: 18px; width: 100%; max-width: 420px; padding: 24px 20px 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
.publish-title { font-size: 17px; font-weight: 700; color: var(--brown-900, #1F1813); margin: 0 0 14px; }
.publish-steps { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
.publish-step { display: flex; align-items: center; gap: 10px; }
.publish-step-icon { width: 20px; display: inline-flex; justify-content: center; }
.publish-step-text { font-size: 14px; color: var(--brown-700, #4D4031); }
.pub-spinner { width: 14px; height: 14px; border: 2px solid var(--brown-100, #F0EBE0); border-top-color: var(--amber-500, #f59e0b); border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; }
.pub-pending { color: var(--brown-300, #D8CFBE); }
.publish-close-btn { width: 100%; padding: 12px; border-radius: 12px; border: 1px solid var(--brown-100, #F0EBE0); background: none; color: var(--brown-600, #524739); font-size: 14px; cursor: pointer; }
.publish-success { text-align: center; padding: 8px 0; }
.success-icon-big { font-size: 52px; margin-bottom: 10px; }
.publish-success-desc { font-size: 13px; color: var(--brown-500, #9C8B6A); margin-bottom: 20px; }
.publish-actions { display: flex; flex-direction: column; gap: 10px; }
.publish-btn { display: block; width: 100%; padding: 13px; border-radius: 12px; font-size: 15px; font-weight: 600; text-align: center; cursor: pointer; text-decoration: none; border: none; }
.publish-btn.primary { background: var(--brown-700, #4D4031); color: #fff; }
.publish-btn.secondary { background: var(--brown-100, #F0EBE0); color: var(--brown-600, #524739); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }


.own-tip { background: var(--amber-100, #fef3c7); border: 1px solid var(--amber-400, #fbbf24); color: var(--amber-800, #92400e); font-size: 13px; line-height: 1.6; border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; }

</style>
