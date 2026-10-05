<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getStoredSession, getGuildMemberInfo, getMyGuilds, getGuestSession, TARGET_GUILD_ID } from '@/services/channelAuth'
import { dbGetResults, shareList, shareRevoke, shareCreate, sharePairs } from '@/services/channelDb'
import ShareModal from '@/components/ShareModal.vue'
import HollandShareModal from '@/components/HollandShareModal.vue'
import { fullTypes, quickTypes } from '@/data/personalities'
import type { PersonalityType } from '@/types'
import type { HollandResult, HollandDimension } from '@/types/holland'
import { getTopRoles, getPersona } from '@/assessments/holland/roles'
import { generateRecommendations } from '@/assessments/holland/careers'
import AICrossAnalysisCard from '@/components/AICrossAnalysisCard.vue'
import { getNftiIllustration } from '@/utils/illustrations'
import type { NftiForCross, HollandForCross } from '@/services/crossAnalysis'

const router = useRouter()

const loading = ref(true)
const nickname = ref('')
const gender = ref('')
const province = ref('')
const city = ref('')
const country = ref('')
const guildName = ref('')
const guildRole = ref('')
const testHistory = ref<any[]>([])

const showShare = ref(false)
const selectedRecord = ref<any>(null)
const isLoggedIn = ref(false)

const colors = ['#6366f1','#8b5cf6','#a855f7','#d946ef','#ec4899','#f43f5e','#e11d48','#be123c']
const avatarColor = computed(() => { let h=0; const s=nickname.value||'?'; for(let i=0;i<s.length;i++) h=s.charCodeAt(i)+((h<<5)-h); return colors[Math.abs(h)%colors.length] })
const avatarInitial = computed(() => (nickname.value||'?').charAt(0).toUpperCase())

const latestNonDebugId = computed(() => {
  const nonDebug = testHistory.value.filter((t: any) => t.mode !== 'debug')
  return nonDebug.length > 0 ? nonDebug[0].id : null
})

// 插图统一走 @/utils/illustrations（优先压缩 JPG，缺码回退原 PNG）

function findTypeByCode(code: string, scores: any) {
  const all = [...quickTypes, ...fullTypes]
  const found = all.find(t => t.code === code)
  if (found) return found
  return { code, name: code, description: '', isHidden: false }
}

function getHollandTopCareer(record: any): string {
  const scores = record.scores || {}
  const code = (record.type_code || '') as string
  const careers = generateRecommendations(scores)
  return careers[0]?.title || record.type_name || record.type_code
}

const showHollandShare = ref(false)
const selectedHollandResult = ref<HollandResult | null>(null)

function openShare(record: any) {
  if (record.assessment_type === 'holland') {
    // 霍兰德：构造 HollandResult 打开 HollandShareModal
    const code = (record.type_code || '') as string
    const scores = record.scores || {}
    const dims = code.split('').slice(0, 3) as HollandDimension[]
    const roles = getTopRoles(code)
    const careers = generateRecommendations(scores)
    const southSchool = getPersona(code)
    selectedHollandResult.value = {
      code,
      primary: dims[0] || 'I',
      secondary: dims[1] || 'S',
      tertiary: dims[2] || 'A',
      scores,
      roles,
      summary: '',
      southSchool,
      careers,
    }
    showHollandShare.value = true
  } else {
    selectedRecord.value = record
    showShare.value = true
  }
}

const shareType = computed((): PersonalityType => {
  if (!selectedRecord.value) return quickTypes[0]!
  return findTypeByCode(selectedRecord.value.type_code, selectedRecord.value.scores) || quickTypes[0]!
})
const shareScores = computed(() => {
  if (!selectedRecord.value?.scores) return { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 }
  return selectedRecord.value.scores
})
const shareMode = computed(() => {
  if (!selectedRecord.value) return 'quick'
  const m = selectedRecord.value.mode
  if (m === 'debug') return 'full'
  return m
})
const shareIllustrationUrl = computed(() => getNftiIllustration(shareType.value.illustration))
const shareSessionId = computed(() => { const s = getStoredSession(); return s?.sessionId || '' })

const mbtiToNfti: Record<string, string> = { E: 'O', I: 'R', S: 'G', N: 'V', T: 'L', F: 'E', J: 'S', P: 'F' }
function mapScoreKey(key: string): string { return mbtiToNfti[key] || key }

onMounted(async () => {
  let tinyId: string | null = null
  let guestId: string | null = null

  const stored = getStoredSession()
  if (stored?.sessionId && stored.user) {
    isLoggedIn.value = true
    // 昵称为空时兜底显示（与 HomeView 一致）
    nickname.value = stored.user.nickname || (stored.user.tinyId ? '用户' + stored.user.tinyId.slice(0, 6) : '同学')
    tinyId = stored.user.tinyId

    try {
      const [info, guilds] = await Promise.all([
        getGuildMemberInfo(stored.sessionId),
        getMyGuilds(stored.sessionId),
      ])
      if (info.success && info.data) {
        gender.value = info.data.gender || ''; province.value = info.data.province || ''
        city.value = info.data.city || ''; country.value = info.data.country || ''
      }
      if (guilds.success && guilds.data) {
        const all = [...(guilds.data.joined_guilds || []), ...(guilds.data.managed_guilds || [])]
        const target = all.find((g: any) => g.guild_id === TARGET_GUILD_ID)
        if (target) { guildName.value = target.name || ''; guildRole.value = target.role || '' }
      }
    } catch (_) {}
  } else {
    const guest = getGuestSession()
    if (guest) {
      isLoggedIn.value = true
      nickname.value = '游客同学'
      guestId = guest.guestId
    } else {
      router.push('/')
      return
    }
  }

  // 加载测试记录
  if (tinyId) {
    try {
      const hist = await dbGetResults(undefined, tinyId)
      if (hist.success && hist.data) testHistory.value = hist.data
    } catch (_) {}
    // 加载我的默契分享
    loadShares()
  } else if (guestId) {
    try {
      const hist = await dbGetResults(undefined, undefined, guestId)
      if (hist.success && hist.data) testHistory.value = hist.data
    } catch (_) {}
  }
  loading.value = false
})

// ─── 我的默契分享管理 ───
const myShares = ref<Array<{ code: string; result_id: string; assessment_type: string; expires_at: string; revoked: boolean; type_code: string | null; type_name: string | null; match_count: number }>>([])
const myPairs = ref<Array<{ share_code: string; score: number; level: string; created_at: string; b_nick: string | null }>>([])
const shareBusy = ref('')

async function loadShares() {
  try {
    const res = await shareList()
    if (res.success && res.data) myShares.value = res.data
  } catch (_) {}
  // 配对记录（谁配对了我的分享）
  try {
    const pairs = await sharePairs()
    if (pairs.success && pairs.data) myPairs.value = pairs.data
  } catch (_) {}
}

function shareDaysLeft(expiresAt: string): number {
  const left = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(left / 86400000))
}

const LEVEL_NAMES: Record<string, string> = { soulmate: '天作之合', partner: '默契搭档', acquaintance: '点头之交', stranger: '路人' }
function pairLevelName(level: string): string {
  return LEVEL_NAMES[level] || level
}

async function revokeShare(code: string) {
  shareBusy.value = code
  try {
    await shareRevoke(code)
    await loadShares()
  } catch (_) {}
  shareBusy.value = ''
}

async function regenerateShare(resultId: string) {
  shareBusy.value = 'gen'
  try {
    await shareCreate(resultId)
    await loadShares()
  } catch (_) {}
  shareBusy.value = ''
}

// ─── 记录级分享（个人中心直接分享某条测试记录）───
const recordShareBusy = ref('')
const recordSharePanel = ref(false)
const recordShareCode = ref('')
const recordShareUrl = ref('')
const recordShareError = ref('')
const recordCopied = ref(false)

async function shareRecord(record: any) {
  const stored = getStoredSession()
  if (!stored?.sessionId) { recordShareError.value = '请先登录QQ频道账号'; recordSharePanel.value = true; return }
  recordShareBusy.value = record.id
  recordShareError.value = ''
  try {
    const res = await shareCreate(record.id)
    if (!res.success || !res.code) { recordShareError.value = res.error || '生成失败'; recordSharePanel.value = true; return }
    recordShareCode.value = res.code
    recordShareUrl.value = res.url || (window.location.origin + '/match?code=' + res.code)
    recordShareError.value = ''
    recordSharePanel.value = true
    await loadShares() // 刷新分享列表（可能新建）
  } catch (e: any) {
    recordShareError.value = e?.message || '生成失败'
    recordSharePanel.value = true
  } finally {
    recordShareBusy.value = ''
  }
}

async function copyRecordShare() {
  try { await navigator.clipboard.writeText(recordShareUrl.value) } catch { /* ignore */ }
  recordCopied.value = true
  setTimeout(() => (recordCopied.value = false), 2000)
}

// 复制某条分享的完整链接（分享列表操作）
const copiedLinkCode = ref('')
async function copyShareLink(code: string) {
  try { await navigator.clipboard.writeText(window.location.origin + '/match?code=' + code) } catch { /* ignore */ }
  copiedLinkCode.value = code
  setTimeout(() => (copiedLinkCode.value = ''), 2000)
}


const latestNftiResult = computed(() => testHistory.value.find((t: any) => t.assessment_type !== 'holland'))
const latestHollandResult = computed(() => testHistory.value.find((t: any) => t.assessment_type === 'holland'))
const hasBothResults = computed(() => !!latestNftiResult.value && !!latestHollandResult.value)

const nftiForCross = computed<NftiForCross | null>(() => {
  const r = latestNftiResult.value
  if (!r) return null
  const code = r.type_code
  const allTypes = [...quickTypes, ...fullTypes]
  const typeDef = allTypes.find(t => t.code === code)
  return {
    typeCode: code,
    typeName: r.type_name || code,
    fourLetter: (typeDef as any)?.fourLetter || null,
    scores: r.scores || {},
    mode: r.mode || 'full',
    description: typeDef?.description || '',
    detail: typeDef?.detail || '',
  }
})

const hollandForCross = computed<HollandForCross | null>(() => {
  const r = latestHollandResult.value
  if (!r) return null
  const code = (r.type_code || '') as string
  const scores = r.scores || {}
  const dims = code.split('').slice(0, 3)
  const roles = dims.map(d => ({ dimension: d, name: d, emoji: '❓' }))
  return {
    code,
    primary: dims[0] || '',
    secondary: dims[1] || '',
    tertiary: dims[2] || '',
    scores,
    roles,
  }
})
</script>

<template>
  <div class="profile-page">
    <div class="bg-blob blob-1" aria-hidden="true"></div>
    <div class="bg-blob blob-2" aria-hidden="true"></div>
    <div class="content">
      <div class="top-bar"><button class="back-btn" @click="router.push('/')">← 返回</button></div>

      <div v-if="loading" class="loading-box"><div class="loading-spinner"></div><span>加载中...</span></div>

      <template v-else>
        <div class="profile-head">
          <div class="profile-avatar" :style="{ background: avatarColor }">{{ avatarInitial }}</div>
          <h1 class="profile-name">{{ nickname }}</h1>
          <div class="profile-tags">
            <span v-if="gender" class="tag">{{ gender }}</span>
            <span v-if="province" class="tag">{{ province }}</span>
            <span v-if="city" class="tag">{{ city }}</span>
            <span v-if="country" class="tag">{{ country }}</span>
          </div>
        </div>

        <div v-if="guildName" class="info-card">
          <div class="info-row"><span class="info-label">频道</span><span class="info-value">{{ guildName }}</span></div>
          <div v-if="guildRole" class="info-row"><span class="info-label">角色</span><span class="info-value">{{ guildRole }}</span></div>
        </div>

        <div class="section-title">📊 测试记录</div>
        <div v-if="!testHistory.length" class="empty-state">还没有完成过测试</div>
        <div v-else class="history-list">
          <div v-for="t in testHistory" :key="t.id" class="history-item" @click="openShare(t)">
            <div class="history-top">
              <span v-if="t.assessment_type === 'holland'" class="type-badge holland">霍兰德</span>
              <span v-else class="type-badge nfti">NFTI</span>
              <span class="history-type">{{ t.assessment_type === 'holland' ? getHollandTopCareer(t) : (t.type_name || t.type_code) }}</span>
              <span v-if="t.assessment_type !== 'holland'" class="history-mode" :class="{ 'is-debug': t.mode === 'debug' }">{{ t.mode === 'debug' ? 'DEBUG' : t.mode === 'quick' ? '快速' : '完整' }}</span>
              <span v-if="t.id === latestNonDebugId" class="history-latest">LATEST</span>
              <span class="history-date">{{ (t.created_at || '').split('T')[0] }}</span>
            </div>
            <!-- NFTI 分数 -->
            <div v-if="t.assessment_type !== 'holland' && t.scores" class="history-scores">
              <span v-for="(v, k) in t.scores" :key="k" class="score-chip">{{ mapScoreKey(k as string) }}: {{ v }}</span>
            </div>
            <!-- 霍兰德分数 -->
            <div v-else-if="t.scores" class="history-scores">
              <span class="score-chip code-chip">{{ t.type_code }}</span>
            </div>
            <div class="history-actions">
              <button class="share-record-btn" @click.stop="shareRecord(t)">
                💞 {{ recordShareBusy === t.id ? '生成中...' : '分享默契' }}
              </button>
            </div>
          </div>
        </div>

        <div class="section-title" style="margin-top: var(--space-6);">💞 我的默契分享</div>
        <div v-if="!myShares.length" class="empty-state">完成测试后会自动生成分享链接，可直接在记录里点「分享默契」</div>
        <div v-else class="history-list">
          <div v-for="s in myShares" :key="s.code" class="history-item share-item">
            <div class="history-top">
              <span class="type-badge" :class="s.assessment_type === 'holland' ? 'holland' : 'nfti'">{{ s.assessment_type === 'holland' ? '霍兰德' : 'NFTI' }}</span>
              <span class="code-chip share-code">{{ s.code }}</span>
              <span class="history-mode" :class="{ 'is-debug': false }">{{ s.type_name || s.type_code }}</span>
            </div>
            <div class="share-meta">
              <span class="share-days" :class="{ expired: s.revoked || shareDaysLeft(s.expires_at) === 0 }">
                {{ s.revoked ? '已停用' : shareDaysLeft(s.expires_at) === 0 ? '已过期' : `剩余 ${shareDaysLeft(s.expires_at)} 天` }}
              </span>
              <span class="share-count">已配对 {{ s.match_count }} 次</span>
            </div>
            <div class="share-actions">
              <button class="share-action-btn" @click="copyShareLink(s.code)">{{ copiedLinkCode === s.code ? '已复制 ✓' : '复制链接' }}</button>
              <button
                v-if="!s.revoked"
                class="share-action-btn danger"
                :disabled="shareBusy === s.code"
                @click="revokeShare(s.code)"
              >{{ shareBusy === s.code ? '处理中...' : '停用' }}</button>
              <button
                class="share-action-btn"
                :disabled="shareBusy === 'gen'"
                @click="regenerateShare(s.result_id)"
              >重新申请</button>
            </div>
          </div>
        </div>

        <div v-if="myPairs.length" class="section-title" style="margin-top: var(--space-6);">👀 谁配对了我的分享</div>
        <div v-if="myPairs.length" class="history-list">
          <div v-for="p in myPairs" :key="p.share_code + p.created_at" class="history-item share-item">
            <div class="history-top">
              <span class="history-type">{{ p.b_nick || '神秘同学' }}</span>
              <span class="pair-score">{{ p.score }} 分</span>
              <span class="history-date">{{ (p.created_at || '').replace('T', ' ').slice(0, 16) }}</span>
            </div>
            <div class="share-meta">
              <span class="pair-level">{{ pairLevelName(p.level) }}</span>
              <span class="share-count">分享 {{ p.share_code }}</span>
            </div>
          </div>
        </div>

        <!-- 记录级默契分享弹窗 -->
        <div v-if="recordSharePanel" class="record-modal-overlay" @click="recordSharePanel = false">
          <div class="record-modal" @click.stop>
            <div class="record-modal-header">
              <h3>💞 默契分享链接</h3>
              <button class="record-close" @click="recordSharePanel = false">&times;</button>
            </div>
            <div class="record-modal-body">
              <p v-if="recordShareError" class="record-error">{{ recordShareError }}</p>
              <template v-else>
                <p class="record-tip">把这个链接发给朋友，TA 点开就能和你算默契度</p>
                <div class="record-code-box" style="font-size: 13px; word-break: break-all; line-height: 1.6;">{{ recordShareUrl }}</div>
                <p class="record-tip">分享链接 30 天内有效，可在上方分享列表停用</p>
                <div class="record-actions">
                  <button class="record-btn primary" @click="copyRecordShare">{{ recordCopied ? '已复制 ✓' : '复制分享链接' }}</button>
                  <button class="record-btn ghost" @click="recordSharePanel = false">完成</button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </template>

        <!-- ===== 交叉分析（两个测试都完成时显示） ===== -->
        <div v-if="hasBothResults && nftiForCross && hollandForCross" style="margin-top: var(--space-6);">
          <AICrossAnalysisCard
            :nfti="nftiForCross"
            :holland="hollandForCross"
            :user-tiny-id="getStoredSession()?.user?.tinyId"
          :user-guest-id="getGuestSession()?.guestId"
          />
        </div>

      <ShareModal
        v-if="selectedRecord"
        :show="showShare"
        :mode="shareMode"
        :type="shareType"
        :scores="shareScores"
        :illustration-url="shareIllustrationUrl"
        :is-logged-in="isLoggedIn"
        :session-id="shareSessionId"
        @close="showShare = false"
      />
      <HollandShareModal
        v-if="selectedHollandResult"
        :show="showHollandShare"
        :result="selectedHollandResult"
        :is-logged-in="isLoggedIn"
        :session-id="shareSessionId"
        @close="showHollandShare = false"
      />
    </div>
  </div>
</template>

<style scoped>
.profile-page { min-height: 100vh; position: relative; overflow: hidden; background: var(--color-bg); }
.bg-blob { position: fixed; border-radius: 50%; filter: blur(80px); opacity: 0.35; pointer-events: none; z-index: 0; }
.blob-1 { width: 500px; height: 500px; background: var(--indigo-200); top: -150px; right: -100px; }
.blob-2 { width: 400px; height: 400px; background: var(--amber-200); bottom: -100px; left: -120px; }
.content { position: relative; z-index: 1; max-width: 520px; margin: 0 auto; padding: var(--space-6) var(--space-5); }
.top-bar { margin-bottom: var(--space-6); }
.back-btn { font-size: 14px; font-weight: 600; color: var(--color-primary); background: var(--indigo-50); border: 1px solid var(--indigo-100); border-radius: 10px; padding: 8px 16px; cursor: pointer; }
.loading-box { display: flex; align-items: center; justify-content: center; gap: 10px; padding: var(--space-10); color: var(--gray-400); }
.loading-spinner { width: 24px; height: 24px; border: 3px solid var(--indigo-100); border-top-color: var(--color-primary); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.profile-head { text-align: center; margin-bottom: var(--space-8); }
.profile-avatar { width: 80px; height: 80px; border-radius: 50%; margin: 0 auto var(--space-4); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 700; color: #fff; box-shadow: 0 4px 16px rgba(0,0,0,.1); }
.profile-name { font-family: var(--font-display); font-size: 24px; font-weight: 700; color: var(--gray-900); margin: 0 0 var(--space-3); }
.profile-tags { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
.tag { font-size: 12px; padding: 3px 12px; background: var(--indigo-50); color: var(--color-primary); border-radius: 20px; }
.info-card { background: var(--gray-0); border: 1.5px solid var(--color-border); border-radius: 16px; padding: var(--space-5); margin-bottom: var(--space-6); }
.info-row { display: flex; justify-content: space-between; padding: var(--space-2) 0; border-bottom: 1px solid var(--gray-100); }
.info-row:last-child { border-bottom: none; }
.info-label { font-size: 14px; color: var(--gray-500); }
.info-value { font-size: 14px; font-weight: 600; color: var(--gray-800); }
.section-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; color: var(--gray-800); margin-bottom: var(--space-4); }
.empty-state { text-align: center; padding: var(--space-8); color: var(--gray-400); font-size: 14px; background: var(--gray-0); border: 1.5px solid var(--color-border); border-radius: 16px; }
.history-list { display: flex; flex-direction: column; gap: var(--space-3); }
.history-item { background: var(--gray-0); border: 1.5px solid var(--color-border); border-radius: 14px; padding: var(--space-4); cursor: pointer; transition: box-shadow 200ms, transform 200ms; }
.history-item:hover { box-shadow: 0 4px 16px rgba(0,0,0,.06); }
.history-item:active { transform: scale(.995); }
.history-top { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2); }
.type-badge { font-size: 10px; padding: 2px 7px; border-radius: 6px; font-weight: 700; letter-spacing: 0.5px; }
.type-badge.nfti { background: var(--indigo-50); color: var(--color-primary); }
.type-badge.holland { background: var(--amber-50); color: var(--amber-600); }
.history-type { font-size: 14px; font-weight: 700; color: var(--gray-900); }
.history-mode { font-size: 11px; padding: 2px 8px; background: var(--indigo-50); color: var(--color-primary); border-radius: 20px; font-weight: 500; }
.history-mode.is-debug { background: var(--rose-50); color: var(--rose-600); }
.code-chip { font-size: 13px; font-weight: 800; letter-spacing: 2px; color: var(--amber-700); background: var(--amber-50); }
.history-latest { font-size: 10px; padding: 2px 8px; background: var(--emerald-50); color: var(--emerald-600); border-radius: 20px; font-weight: 700; }
.history-date { font-size: 12px; color: var(--gray-400); margin-left: auto; }
.history-scores { display: flex; flex-wrap: wrap; gap: 4px; }
.score-chip { font-size: 11px; padding: 2px 8px; background: var(--gray-100); color: var(--gray-600); border-radius: 6px; }
.share-item { cursor: default; }
.share-code { font-size: 14px; }
.share-meta { display: flex; align-items: center; gap: 12px; margin: 4px 0 10px; }
.share-days { font-size: 12px; font-weight: 600; color: var(--emerald-600); }
.share-days.expired { color: var(--rose-500); }
.share-count { font-size: 12px; color: var(--gray-400); }
.share-actions { display: flex; gap: 8px; }
.share-action-btn { font-size: 12px; padding: 5px 14px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--gray-0); color: var(--gray-600); cursor: pointer; }
.share-action-btn.danger { color: var(--rose-500); border-color: var(--rose-100); }
.share-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pair-score { font-size: 13px; font-weight: 800; color: var(--amber-700); }
.pair-level { font-size: 12px; font-weight: 600; color: var(--emerald-600); }
.history-actions { margin-top: 10px; }
.share-record-btn { font-size: 12px; padding: 6px 14px; border-radius: 8px; border: 1px solid var(--amber-200); background: var(--amber-50); color: var(--amber-700); cursor: pointer; font-weight: 600; }
.share-record-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.record-modal-overlay { position: fixed; inset: 0; background: rgba(19, 19, 31, 0.5); backdrop-filter: blur(8px); display: flex; justify-content: center; align-items: center; z-index: 120; padding: 20px; }
.record-modal { background: #fff; border-radius: 18px; max-width: 420px; width: 100%; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.record-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--gray-100); }
.record-modal-header h3 { margin: 0; font-size: 16px; }
.record-close { background: none; border: none; font-size: 22px; cursor: pointer; color: var(--gray-400); }
.record-modal-body { padding: 20px; }
.record-tip { font-size: 13px; color: var(--gray-500); margin-bottom: 10px; }
.record-error { color: var(--rose-500); font-size: 14px; }
.record-code-box { font-family: monospace; font-size: 24px; font-weight: 700; letter-spacing: 2px; text-align: center; padding: 14px; border-radius: 12px; background: var(--amber-50); color: var(--amber-700); margin: 12px 0; }
.record-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.record-btn { padding: 11px 18px; border-radius: 10px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; }
.record-btn.primary { background: var(--color-primary); color: #fff; }
.record-btn.ghost { background: var(--gray-100); color: var(--gray-600); }
</style>
