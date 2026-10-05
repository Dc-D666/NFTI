<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { matchGet } from '@/services/channelDb'
import { getMatchTitle, getMatchLevel, getActivityRecommendations } from '@/data/matchRules'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const errorMsg = ref('')
const detail = ref<{ match: any; owner: any; mate: any } | null>(null)

onMounted(async () => {
  const id = String(route.params.id || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    errorMsg.value = '无效的配对链接'
    loading.value = false
    return
  }
  try {
    const res = await matchGet(id)
    if (!res.success || !res.match) {
      errorMsg.value = res.error || '配对结果不存在或已失效'
    } else {
      detail.value = { match: res.match, owner: res.owner, mate: res.mate }
    }
  } catch (e: any) {
    errorMsg.value = e?.message || '加载失败，请重试'
  } finally {
    loading.value = false
  }
})

const titleResult = computed(() => {
  if (!detail.value) return null
  return getMatchTitle(detail.value.owner?.type_code || '', detail.value.mate?.type_code || '')
})
const levelInfo = computed(() => detail.value ? getMatchLevel(detail.value.match.level) : null)
const activities = computed(() => detail.value ? getActivityRecommendations(detail.value.match.data) : [])
const nftiDims = computed(() => {
  const d = detail.value?.match?.data?.dims
  if (!d) return []
  return [
    { label: '社交电量', value: d.social?.harmony ?? 0 },
    { label: '信息偏好', value: d.info?.harmony ?? 0 },
    { label: '决策风格', value: d.decision?.harmony ?? 0 },
    { label: '生活节奏', value: d.rhythm?.harmony ?? 0 },
  ]
})

// ─── AI 剧本聊天解析（与 MatchView 一致）───
interface ChatMsg { speaker: 'a' | 'b'; text: string }
interface ChatScript { messages: ChatMsg[]; reverse: string }

function parseChatScript(story: string): ChatScript | null {
  const m = story.match(/【默契剧本】([\s\S]*?)(?:【TA眼中的你】([\s\S]*))?$/)
  const head = m && m[1] ? m[1] : (story.replace(/【默契剧本】/g, '').split('【TA眼中的你】')[0] || '').trim()
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
  const s = detail.value?.match?.ai_story
  if (!s) return null
  return parseChatScript(s)
})

const chatANick = computed(() => detail.value?.owner?.nick || 'TA')
const chatBNick = computed(() => detail.value?.mate?.nick || '我')
const AVATAR_COLORS = ['#4D4031', '#6E5F48', '#9C8B6A', '#BBA888', '#f59e0b', '#d97706', '#b45309', '#e11d48', '#fb7185', '#78716c']
function chatAvatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]!
}
function chatAvatarChar(name: string): string {
  return (name || '?').charAt(0).toUpperCase()
}

const copied = ref(false)
async function copyResultLink() {
  try { await navigator.clipboard.writeText(window.location.href) } catch {
    const ta = document.createElement('textarea')
    ta.value = window.location.href
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <div class="result-page">
    <div class="result-content">
      <div class="result-header">
        <button class="back-btn" @click="router.push('/')">← 返回首页</button>
        <h1 class="result-title">💞 默契度结果</h1>
      </div>

      <div v-if="loading" class="card loading-card">
        <div class="spinner"></div>
        <p>正在加载配对结果...</p>
      </div>

      <div v-else-if="errorMsg" class="card error-card">
        <p class="error-msg">😵 {{ errorMsg }}</p>
        <button class="btn-primary" @click="router.push('/')">回首页</button>
      </div>

      <template v-else-if="detail">
        <!-- 分数大卡 -->
        <div class="score-card" :class="levelInfo?.key">
          <div class="score-big">{{ detail.match.score }}</div>
          <div class="score-label">默契度</div>
          <div class="level-badge">{{ levelInfo?.emoji }} {{ levelInfo?.name }}</div>
          <div v-if="titleResult" class="combo-title">{{ titleResult.title }}</div>
          <p class="level-desc">{{ levelInfo?.desc }}</p>
        </div>

        <!-- 双方 -->
        <div class="duo-row">
          <div class="duo-card">
            <span class="duo-role">口令主人</span>
            <b>{{ detail.owner?.nick || '神秘同学' }}</b>
            <span>{{ detail.owner?.type_name }}</span>
          </div>
          <div class="duo-heart">💞</div>
          <div class="duo-card">
            <span class="duo-role">配对者</span>
            <b>{{ detail.mate?.nick || '神秘同学' }}</b>
            <span>{{ detail.mate?.type_name }}</span>
          </div>
        </div>

        <!-- 四维契合 -->
        <div v-if="nftiDims.length" class="card">
          <h3 class="card-title">四维契合度</h3>
          <div v-for="d in nftiDims" :key="d.label" class="bar-row">
            <span class="bar-label">{{ d.label }}</span>
            <div class="bar-track"><div class="bar-fill" :style="{ width: d.value + '%' }"></div></div>
            <span class="bar-num">{{ d.value }}</span>
          </div>
        </div>

        <!-- AI 剧本（微信风格） -->
        <div v-if="chatScript" class="card ai-card">
          <h3 class="card-title">🤖 南中关系剧本</h3>
          <div class="chat-window">
            <div class="chat-header">{{ chatANick }} 和 {{ chatBNick }} 的聊天记录</div>
            <div class="chat-body">
              <div
                v-for="(msg, i) in chatScript.messages"
                :key="i"
                class="chat-row"
                :class="msg.speaker === 'a' ? 'left' : 'right'"
              >
                <div class="chat-avatar" :style="{ background: chatAvatarColor(msg.speaker === 'a' ? chatANick : chatBNick) }">{{ chatAvatarChar(msg.speaker === 'a' ? chatANick : chatBNick) }}</div>
                <div class="chat-bubble" :class="msg.speaker === 'a' ? 'from-a' : 'from-b'">{{ msg.text }}</div>
              </div>
            </div>
            <div class="chat-footer">✨ AI 模拟的聊天记录，仅供娱乐</div>
          </div>
          <div v-if="chatScript.reverse" class="ai-reverse">
            <span class="ai-reverse-label">TA 眼中的你</span>
            <p>{{ chatScript.reverse }}</p>
          </div>
        </div>
        <div v-else-if="detail.match.ai_story" class="card ai-card">
          <h3 class="card-title">🤖 南中关系剧本</h3>
          <p class="ai-story">{{ detail.match.ai_story }}</p>
        </div>

        <!-- 推荐 -->
        <div class="card">
          <h3 class="card-title">🎯 适合一起做的事</h3>
          <ul class="activity-list">
            <li v-for="(a, i) in activities" :key="i">{{ a }}</li>
          </ul>
        </div>

        <!-- 分享 -->
        <div class="share-actions">
          <button class="btn-primary" @click="copyResultLink">{{ copied ? '已复制 ✓' : '🔗 复制结果链接' }}</button>
          <button class="btn-ghost" @click="router.push('/')">回首页</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.result-page { min-height: 100vh; background: linear-gradient(180deg, var(--brown-50, #FBF8F3) 0%, #fff 100%); color: var(--brown-900, #1F1813); }
.result-content { max-width: 560px; margin: 0 auto; padding: 16px 20px 60px; }
.result-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.back-btn { background: none; border: 1px solid var(--brown-200, #E4DDCD); border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 13px; color: var(--brown-700, #4D4031); }
.result-title { font-size: 22px; font-weight: 700; margin: 0; }
.card { background: #fff; border: 1px solid var(--brown-100, #F0EBE0); border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 2px 12px rgba(31, 24, 19, 0.04); }
.loading-card, .error-card { text-align: center; padding: 60px 20px; }
.spinner { width: 32px; height: 32px; border: 3px solid var(--brown-100, #F0EBE0); border-top-color: var(--amber-500, #f59e0b); border-radius: 50%; margin: 0 auto 16px; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.error-msg { margin-bottom: 16px; }
.btn-primary { background: var(--brown-700, #4D4031); color: #fff; border: none; border-radius: 10px; padding: 12px 22px; cursor: pointer; font-size: 15px; font-weight: 600; }
.btn-ghost { background: none; border: 1px solid var(--brown-200, #E4DDCD); border-radius: 10px; padding: 12px 18px; cursor: pointer; font-size: 14px; color: var(--brown-700, #4D4031); }
.score-card { text-align: center; padding: 32px 20px; border-radius: 20px; background: linear-gradient(135deg, var(--brown-700, #4D4031), var(--brown-800, #2E2219)); color: #fff; margin-bottom: 16px; }
.score-big { font-size: 64px; font-weight: 800; line-height: 1; background: linear-gradient(90deg, var(--amber-300, #fcd34d), var(--amber-500, #f59e0b)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.score-label { font-size: 13px; color: var(--brown-300, #D8CFBE); margin: 4px 0 8px; letter-spacing: 4px; }
.level-badge { display: inline-block; background: var(--amber-500, #f59e0b); color: var(--brown-900, #1F1813); font-weight: 700; padding: 5px 16px; border-radius: 999px; font-size: 15px; margin-bottom: 10px; }
.combo-title { font-size: 22px; font-weight: 800; margin-top: 8px; }
.level-desc { font-size: 13px; color: var(--brown-200, #E4DDCD); margin-top: 10px; }
.duo-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 16px; }
.duo-card { flex: 1; background: #fff; border: 1px solid var(--brown-100, #F0EBE0); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.duo-role { font-size: 11px; color: var(--brown-400, #9C8B6A); }
.duo-card b { font-size: 15px; }
.duo-card span:last-child { font-size: 12px; color: var(--brown-500, #9C8B6A); }
.duo-heart { font-size: 22px; }
.card-title { margin: 0 0 12px; font-size: 16px; }
.bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.bar-label { width: 64px; font-size: 12px; color: var(--brown-600, #524739); }
.bar-track { flex: 1; height: 8px; background: var(--brown-100, #F0EBE0); border-radius: 999px; overflow: hidden; }
.bar-fill { height: 100%; background: linear-gradient(90deg, var(--amber-400, #fbbf24), var(--amber-500, #f59e0b)); border-radius: 999px; }
.bar-num { font-size: 12px; color: var(--brown-500, #9C8B6A); width: 26px; text-align: right; }
.ai-story { font-size: 15px; line-height: 1.7; color: var(--brown-800, #2E2219); white-space: pre-wrap; }
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
.activity-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; }
.activity-list li { font-size: 14px; color: var(--brown-700, #4D4031); }
.share-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
</style>
