<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useTestStore } from '@/stores/testStore'
import { ref, onMounted, onUnmounted, computed } from 'vue'
import qqQrImg from '@/assets/QQ.jpg'
import wxQrImg from '@/assets/WX.jpg'
import ChannelAuthModal from '@/components/ChannelAuthModal.vue'
import HomeAiChat from '@/components/HomeAiChat.vue'
import {
  getStoredSession, checkSession, pollToken, getGuildMemberInfo, getGuildInfo, getMyFeeds,
  getHotFeeds, getFeedShareUrl, clearSession, serverLogout, checkUserInGuild,
  getGuestId, getGuestSession, getPendingOAuthSession, clearPendingOAuthSession,
  importPatSession, getPendingMatchCode, clearPendingMatchCode,
//   getAppMode, setAppMode, isBetaUnlocked, clearBetaUnlock,
} from '@/services/channelAuth'
import { dbIncrementPageVisit } from '@/services/channelDb'
import type { GuildFeed } from '@/services/channelAuth'

const router = useRouter()
const store = useTestStore()
const showResumeModal = ref(false)
const resumeType = ref<'nfti' | 'holland'>('nfti')
const resumeMode = ref<'quick' | 'full' | 'debug' | null>(null)
const resumePage = ref(1)
const showContributors = ref(false)
const showChangelog = ref(false)

const isLoggedIn = ref(false)
// const isBeta = computed(() => getAppMode() === 'beta')
const sessionId = ref('')
const nickname = ref('')
const gender = ref('')
const province = ref('')
const city = ref('')
const showChannelAuth = ref(false)
const menuOpen = ref(false)

const guildName = ref('')
const guildNumber = ref('')
const guildType = ref('')
const memberCount = ref(0)
const guildAvatar = ref('')
const profile = ref('')
const guildShareUrl = ref('')
const guildCreateTime = ref('')

const myFeeds = ref<GuildFeed[]>([])
const hotFeeds = ref<GuildFeed[]>([])
const loadingHot = ref(false)
const loadingMy = ref(false)

const showAiChat = ref(false)
const showAiLoginPrompt = ref(false)
const showStatsLoginPrompt = ref(false)
const showStatsGuestPrompt = ref(false)
const showJoinGuide = ref(false)

// 测试入口登录提醒（未登录/游客 → 提醒登录才能保存记录）
const showTestLoginPrompt = ref(false)
const pendingTestKind = ref<'nfti' | 'holland'>('nfti')
const pendingTestMode = ref<'quick' | 'full' | 'debug'>('full')

const avatarColors = ['#6366f1','#8b5cf6','#a855f7','#d946ef','#ec4899','#f43f5e','#e11d48','#be123c']
const avatarColor = computed(() => { let h=0; const s=nickname.value||'?'; for(let i=0;i<s.length;i++) h=s.charCodeAt(i)+((h<<5)-h); return avatarColors[Math.abs(h)%avatarColors.length] })
const avatarInitial = computed(() => (nickname.value||'?').charAt(0).toUpperCase())

const debugEnabled = ref(false)
const hollandDebug = ref(false)
const clickCount = ref(0)
let clickTimer: ReturnType<typeof setTimeout> | null = null
let oauthPollId: ReturnType<typeof setInterval> | null = null
let oauthTimeoutId: ReturnType<typeof setTimeout> | null = null
// const modeToggleCount = ref(0)

onMounted(async () => {
  // ─── PatPlayer 体验任务：?pat_ticket= 一次性登录（借用 QQ token，无需扫码）───
  const patUrl = new URL(window.location.href)
  const patTicket = patUrl.searchParams.get('pat_ticket')
  if (patTicket) {
    patUrl.searchParams.delete('pat_ticket')
    window.history.replaceState({}, '', patUrl.toString())
    try {
      const imp = await importPatSession(patTicket)
      if (imp.status === 'authorized' && imp.user) {
        sessionId.value = getStoredSession()?.sessionId || ''
        isLoggedIn.value = true
        nickname.value = imp.user.nickname || '用户' + imp.user.tinyId.slice(0, 6)
        await Promise.all([loadUserInfo(), loadGuildInfo()])
        await loadHotFeeds()
        loadMyFeeds()
      }
    } catch (_) { /* ticket 失效则走普通流程 */ }
  }

  // 检查 NFTI 未完成进度
  const nftiUnfinished = store.hasUnfinishedProgress()
  // 检查霍兰德未完成进度
  let hollandUnfinished: { page: number } | null = null
  try {
    const saved = localStorage.getItem('holland_progress')
    if (saved) {
      const data = JSON.parse(saved)
      if (data.answers && data.page) {
        hollandUnfinished = { page: data.page }
      }
    }
  } catch {}

  if (nftiUnfinished) {
    resumeType.value = 'nfti'
    resumeMode.value = nftiUnfinished.mode
    resumePage.value = nftiUnfinished.currentPage
    showResumeModal.value = true
  } else if (hollandUnfinished) {
    resumeType.value = 'holland'
    resumeMode.value = 'full'
    resumePage.value = hollandUnfinished.page
    showResumeModal.value = true
  }
  // 页面访问计数（服务端限流：同一 IP 每分钟 60 次，失败静默）
  dbIncrementPageVisit().catch(() => {})

  // 检查网站是否已通过邀请码解锁（不关联登录状态）
//   const unlocked = isBetaUnlocked()

  // 检查 QQ session（真正的登录）
  // 清理 OAuth 回调 URL 残余参数（手机端 connect.qq.com 跳回后携带 ?code=xxx&state=yyy）
  const url = new URL(window.location.href)
  if (url.searchParams.has('code') || url.searchParams.has('state')) {
    url.searchParams.delete('code')
    url.searchParams.delete('state')
    window.history.replaceState({}, '', url.toString())
  }

  const stored = getStoredSession()

  // ─── OAuth 回调恢复（无论 stored 有无 sessionId）───
  const pending = getPendingOAuthSession()
  if (pending) {
    try {
      const sessionOk = await checkSession(pending.sessionId)
      if (sessionOk) {
        const result = await pollToken(pending.sessionId)
        if (result.status === 'authorized' && result.user) {
          sessionId.value = pending.sessionId
          isLoggedIn.value = true; nickname.value = result.user.nickname || (result.user.tinyId ? '用户' + result.user.tinyId.slice(0, 6) : '同学')
          await Promise.all([loadUserInfo(), loadGuildInfo()])
          await loadHotFeeds()
          loadMyFeeds()
          clearPendingOAuthSession()
        } else {
          // session 还在等待授权，启动短暂轮询
          oauthPollId = setInterval(async () => {
            try {
              const r = await pollToken(pending.sessionId)
              if (r.status === 'authorized' && r.user) {
                if (oauthPollId) clearInterval(oauthPollId); if (oauthTimeoutId) clearTimeout(oauthTimeoutId)
                isLoggedIn.value = true; nickname.value = r.user.nickname || (r.user.tinyId ? '用户' + r.user.tinyId.slice(0, 6) : '同学')
                await Promise.all([loadUserInfo(), loadGuildInfo()])
                await loadHotFeeds()
                loadMyFeeds()
                clearPendingOAuthSession()
              } else if (r.status === 'expired') {
                if (oauthPollId) clearInterval(oauthPollId); if (oauthTimeoutId) clearTimeout(oauthTimeoutId)
                clearPendingOAuthSession()
              }
            } catch {
              if (oauthPollId) clearInterval(oauthPollId); if (oauthTimeoutId) clearTimeout(oauthTimeoutId)
              clearPendingOAuthSession()
            }
          }, 2000)
          oauthTimeoutId = setTimeout(() => {
            if (oauthPollId) clearInterval(oauthPollId)
            clearPendingOAuthSession()
          }, 30000)
        }
      } else {
        clearPendingOAuthSession()
      }
    } catch {
      clearPendingOAuthSession()
    }
  }

  // 常规 session 检查（如果 OAuth 恢复成功则跳过）
  if (!isLoggedIn.value && stored?.sessionId) {
    sessionId.value = stored.sessionId
    try {
      const valid = await checkSession(stored.sessionId)
      if (valid) {
        isLoggedIn.value = true; nickname.value = stored.user?.nickname || (stored.user?.tinyId ? '用户' + stored.user.tinyId.slice(0, 6) : '同学')
        await Promise.all([loadUserInfo(), loadGuildInfo()])
        await loadHotFeeds()
        loadMyFeeds()
      }
    } catch (_) {}
  }

  // 开放正式版：打开页面直接可用，不再自动弹登录/解锁窗（恢复内测或需要弹窗时取消注释）
  // 仍无登录 → 弹 auth modal
  // if (!isLoggedIn.value) {
  //   const hasSeenAuth = sessionStorage.getItem('nfti_auth_seen')
  //   if (!hasSeenAuth) {
  //     setTimeout(() => { showChannelAuth.value = true }, 600)
  //     sessionStorage.setItem('nfti_auth_seen', '1')
  //   }
  // }
})

// 组件卸载：统一清理定时器，防止泄漏
onUnmounted(() => {
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
  if (oauthPollId) { clearInterval(oauthPollId); oauthPollId = null }
  if (oauthTimeoutId) { clearTimeout(oauthTimeoutId); oauthTimeoutId = null }
})

function startTest(mode: 'quick' | 'full' | 'debug') {
  // 内测模式下未解锁则弹出解锁窗口
//   if (isBeta.value && !isBetaUnlocked()) { showChannelAuth.value = true; return }
  // 未登录/游客 → 提醒登录后才能保存测试记录（可继续）
  if (!getStoredSession()) {
    pendingTestKind.value = 'nfti'
    pendingTestMode.value = mode
    showTestLoginPrompt.value = true
    return
  }
  // 开始新测试前重置状态，防止同模式重测时残留上一次的答案
  store.reset()
  store.setMode(mode); router.push('/test/' + mode + '/1')
}
function startHollandTest() {
//   if (isBeta.value && !isBetaUnlocked()) { showChannelAuth.value = true; return }
  if (hollandDebug.value) { router.push('/holland-test/1?debug=1'); return }
  // 未登录/游客 → 提醒登录后才能保存测试记录（可继续）
  if (!getStoredSession()) {
    pendingTestKind.value = 'holland'
    showTestLoginPrompt.value = true
    return
  }
  router.push('/holland-test/1')
}
function handleTestLoginPromptClose() {
  showTestLoginPrompt.value = false
  // 「知道了」→ 继续进入之前想开始的测试
  if (pendingTestKind.value === 'nfti') {
    store.reset()
    store.setMode(pendingTestMode.value)
    router.push('/test/' + pendingTestMode.value + '/1')
  } else {
    router.push('/holland-test/1')
  }
}
function handleLogoClick() {
  clickCount.value++
  if (clickTimer) clearTimeout(clickTimer)
  clickTimer = setTimeout(() => { clickCount.value = 0 }, 2000)
  if (clickCount.value >= 5) {
    debugEnabled.value = !debugEnabled.value
    hollandDebug.value = debugEnabled.value
    clickCount.value = 0
  }
}
// function handleModeToggle() {
//   modeToggleCount.value++
//   if (modeToggleTimer) clearTimeout(modeToggleTimer)
//   modeToggleTimer = setTimeout(() => { modeToggleCount.value = 0 }, 2000)
//   if (modeToggleCount.value >= 5) {
//     const next = isBeta.value ? 'production' : 'beta'
//     setAppMode(next)
//     window.location.reload()
//   }
// }
function resumeTest() {
  if (resumeType.value === 'holland') {
    router.push('/holland-test/' + resumePage.value)
  } else if (resumeMode.value) {
    store.loadProgress()
    router.push('/test/' + resumeMode.value + '/' + resumePage.value)
  }
  showResumeModal.value = false
}
function dismissModal() {
  showResumeModal.value = false
  if (resumeType.value === 'holland') {
    localStorage.removeItem('holland_progress')
  } else {
    store.clearProgress()
  }
}

async function loadUserInfo() {
  try { const info = await getGuildMemberInfo(sessionId.value); if (info.success && info.data) { gender.value = info.data.gender || ''; province.value = info.data.province || ''; city.value = info.data.city || '' } } catch (_) {}
}
async function loadGuildInfo() {
  try { const info = await getGuildInfo(sessionId.value); if (info.success && info.data) { guildName.value = info.data.name || ''; guildNumber.value = info.data.guild_number || ''; guildType.value = info.data.guild_type || ''; memberCount.value = info.data.member_count || 0; guildAvatar.value = info.data.avatar_url || ''; profile.value = info.data.profile || ''; guildShareUrl.value = info.data.share_url || ''; guildCreateTime.value = info.data.create_time_human || '' } } catch (_) {}
}
async function loadMyFeeds() { loadingMy.value = true; try { const r = await getMyFeeds(sessionId.value, 10); if (r.success && r.data?.feeds) myFeeds.value = r.data.feeds } catch (_) {}; loadingMy.value = false }
async function loadHotFeeds(retries = 2) {
  loadingHot.value = true
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await getHotFeeds(sessionId.value, 10)
      if (r.success && r.data?.feeds) {
        hotFeeds.value = r.data.feeds
        break
      }
      if (attempt < retries) await new Promise(r => setTimeout(r, 1000))
      else hotFeeds.value = []
    } catch (_) {
      if (attempt < retries) await new Promise(r => setTimeout(r, 1000))
      else hotFeeds.value = []
    }
  }
  loadingHot.value = false
}
function handleLogout() {
  menuOpen.value = false; const sid = sessionId.value; if (sid) serverLogout(sid)
  clearSession() // clearBetaUnlock() 已注释：import 已注释且当前无内测，恢复内测时一并取消注释
  isLoggedIn.value = false; nickname.value = ''; gender.value = ''; province.value = ''; city.value = ''
  guildName.value = ''; guildNumber.value = ''; guildType.value = ''; memberCount.value = 0; guildAvatar.value = ''; profile.value = ''
  guildShareUrl.value = ''; guildCreateTime.value = ''; myFeeds.value = []; hotFeeds.value = []; sessionId.value = ''
}
function openFeed(feedId: string) {
  if (!sessionId.value || !feedId) return
  getFeedShareUrl(sessionId.value, feedId).then((r: any) => {
    const url = r?.data?.share_url || r?.data?.url || r?.share_url || r?.url || ''
    if (url) window.open(url, '_blank')
    else window.open('https://pd.qq.com/s/' + feedId, '_blank')
  }).catch(() => { window.open('https://pd.qq.com/s/' + feedId, '_blank') })
}
function openAiChat() {
  const stored = getStoredSession()
  if (!stored?.sessionId) { showAiLoginPrompt.value = true; return }
  showAiChat.value = true
}
function handleAiLoginPromptClose() { showAiLoginPrompt.value = false }
function handleStatsClick() {
  // QQ 登录用户直接通行
  const stored = getStoredSession()
  if (stored?.sessionId) { router.push('/stats'); return }
  // 游客身份拦截
  if (getGuestSession()) { showStatsGuestPrompt.value = true; return }
  // 未登录
  showStatsLoginPrompt.value = true
}
function handleStatsLoginPromptClose() { showStatsLoginPrompt.value = false }
function onUnlocked() {
  showChannelAuth.value = false
}

function onAuthSuccess(name: string) {
  isLoggedIn.value = true; nickname.value = name; showChannelAuth.value = false; menuOpen.value = false
  // 默契度分享：从口令链接跳首页登录后，自动回到配对流程
  const pendingCode = getPendingMatchCode()
  if (pendingCode) {
    clearPendingMatchCode()
    router.push('/match?code=' + pendingCode)
    return
  }
  const stored = getStoredSession()
  if (stored?.sessionId) {
    sessionId.value = stored.sessionId; loadUserInfo(); loadGuildInfo()
    loadHotFeeds().then(() => loadMyFeeds())
//     checkUserInGuild(stored.sessionId).then(inGuild => { if (!inGuild) showJoinGuide.value = true }).catch(() => {})
  }
}

function onGuestLogin() {
  clearSession() // 清除可能残留的 QQ session
  getGuestId() // 触发游客 ID 生成
  showChannelAuth.value = false
  isLoggedIn.value = true
  nickname.value = '游客同学'
}
</script>

<template>
  <main class="min-h-screen font-sans antialiased" style="font-family: var(--font-sans);">
    <div class="mx-auto w-full max-w-[560px] px-5 pb-10">

      <!-- Top bar -->
      <header class="flex items-center justify-between py-5">
        <span class="text-[11px] font-medium uppercase" style="color: hsl(var(--muted-foreground)); letter-spacing: 0.12em;">南方中学 · 测评中心</span>
        <div class="flex items-center gap-2">
<!--           <span v-if="isBeta" class="beta-badge" @click="handleModeToggle" title="点击5次切换模式">内测版</span> -->
          <div class="relative">
            <button class="gt-text-btn text-[14px] font-semibold" @click="router.push('/gallery')">图鉴</button>
          </div>
          <div class="relative">
            <button class="gt-text-btn text-[14px] font-semibold" @click="showChangelog = true">更新日志</button>
            <!-- 最新版本气泡：版本 / 更新日期 / 摘要 -->
            <div class="version-bubble">
              <div class="version-bubble-line"><span class="version-bubble-dot"></span><span>最新 v3.4 · 2026-08-21</span></div>
              <div class="version-bubble-summary">新增默契度测试</div>
            </div>
          </div>
          <template v-if="!isLoggedIn">
            <button class="gt-btn-primary text-[13px] font-semibold" @click="showChannelAuth = true">登录</button>
          </template>
          <template v-else>
            <div class="relative">
              <button class="avatar-btn" @click="menuOpen = !menuOpen" :style="{ background: avatarColor }">{{ avatarInitial }}</button>
              <div v-if="menuOpen" class="dropdown-bg" @click="menuOpen = false"></div>
              <transition name="pop">
                <div v-if="menuOpen" class="dropdown" @click.stop>
                  <div class="dropdown-head">
                    <div class="dropdown-avatar" :style="{ background: avatarColor }">{{ avatarInitial }}</div>
                    <div class="dropdown-name">{{ nickname }}</div>
                    <div class="dropdown-tags">
                      <span v-if="gender" class="dd-tag">{{ gender }}</span>
                      <span v-if="province" class="dd-tag">{{ province }}</span>
                      <span v-if="city" class="dd-tag">{{ city }}</span>
                    </div>
                  </div>
                  <div class="dropdown-foot">
                    <button class="dd-profile" @click="router.push('/profile'); menuOpen = false">个人中心</button>
                    <button class="dd-logout" @click="handleLogout">退出</button>
                  </div>
                </div>
              </transition>
            </div>
          </template>
        </div>
      </header>

      <!-- Hero -->
      <section class="pb-8">
        <div class="text-[20px] font-bold pb-3" style="color: hsl(var(--primary)); letter-spacing: 0.02em;" @click="handleLogoClick">NFTI</div>
        <h1 class="font-bold leading-[1.15]" style="font-size: clamp(36px, 9vw, 48px); color: hsl(var(--foreground)); text-wrap: balance; word-break: keep-all; overflow-wrap: break-word;">你是哪种<br><span style="color: hsl(var(--primary)); font-style: italic;">南方人</span></h1>
        <p class="text-[15px] mt-4 leading-[1.7]" style="color: hsl(var(--muted-foreground));">基于南方中学真实校园场景<br>人格测试 + 职业测评</p>
      </section>

      <!-- Section: 人格测试 -->
      <section class="pb-6">
        <div class="flex flex-col gap-3">

          <!-- Card 1: 完整测试 (PRIMARY CTA) -->
          <a href="#" class="group block p-5 transition-opacity duration-150 hover:opacity-95 active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-foreground))]" style="background-color: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border-radius: var(--radius);" @click.prevent="startTest(debugEnabled ? 'debug' : 'full')">
            <div class="flex items-center justify-between mb-2.5">
              <span class="text-[15px] font-bold" style="color: hsl(var(--primary-foreground)); letter-spacing: 0.02em;">人格测试</span>
              <span class="gt-badge-accent">~8 分钟</span>
            </div>
            <div class="text-[20px] font-bold mb-1" style="color: hsl(var(--primary-foreground)); opacity: 0.9;">48 道题</div>
            <p class="text-[14px] mb-3.5" style="color: hsl(var(--primary-foreground)); opacity: 0.75;">16 种标准人格 + 3 款隐藏</p>
            <div class="flex items-center justify-between">
              <div class="flex gap-2">
                <span class="gt-badge-accent">深度解析</span>
                <span class="gt-badge-accent">隐藏彩蛋</span>
              </div>
              <svg class="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" style="color: hsl(var(--primary-foreground));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </div>
            <div v-if="debugEnabled" class="debug-badge">DEBUG</div>
          </a>

        </div>
      </section>

      <!-- Section: 职业测评 -->
      <section class="pb-6">

        <article class="group block p-5 transition-opacity duration-150 hover:opacity-95 active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-foreground))]" style="background-color: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border-radius: var(--radius);" @click="startHollandTest()">
          <div class="flex items-center justify-between mb-2.5">
            <span class="text-[15px] font-bold" style="color: hsl(var(--primary-foreground)); letter-spacing: 0.02em;">职业测试</span>
            <span class="gt-badge-accent">~7 分钟</span>
          </div>
          <div class="text-[20px] font-bold mb-1" style="color: hsl(var(--primary-foreground)); opacity: 0.9;">48 道题</div>
          <p class="text-[14px] mb-3.5" style="color: hsl(var(--primary-foreground)); opacity: 0.75;">测测你适合什么方向</p>
          <div class="flex items-center justify-between">
            <div class="flex gap-2">
              <span class="gt-badge-accent">六大类型</span>
              <span class="gt-badge-accent">专业推荐</span>
            </div>
            <svg class="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" style="color: hsl(var(--primary-foreground));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
          <div v-if="hollandDebug" class="debug-badge">DEBUG</div>
        </article>
      </section>

      <!-- Section: 默契度 -->
      <section class="pb-6">
        <a href="#" class="group block p-5 transition-opacity duration-150 hover:opacity-95 active:opacity-90 focus-visible:outline-none focus-visible:ring-2" style="background-color: #fef3c7; color: #92400e; border-radius: var(--radius);" @click.prevent="router.push('/match')">
          <div class="flex items-center justify-between mb-2.5">
            <span class="text-[15px] font-bold" style="letter-spacing: 0.02em;">💞 默契度</span>
            <span class="gt-badge-accent" style="background: #fde68a; color: #92400e;">NEW</span>
          </div>
          <div class="text-[20px] font-bold mb-1" style="opacity: 0.9;">和 TA 有多默契？</div>
          <p class="text-[14px] mb-3.5" style="opacity: 0.75;">输入朋友的口令，看看你们是天生一对还是点头之交</p>
          <div class="flex items-center justify-between">
            <div class="flex gap-2">
              <span class="gt-badge-accent" style="background: #fde68a; color: #92400e;">组合称号</span>
              <span class="gt-badge-accent" style="background: #fde68a; color: #92400e;">AI 剧本</span>
            </div>
            <svg class="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" style="color: #92400e;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
        </a>
      </section>

      <!-- Stats card -->
      <button class="group flex w-full items-start gap-3.5 p-5 mb-3 transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] text-left" style="border: 2px dashed hsl(var(--secondary)); border-radius: var(--radius); background-color: hsl(var(--card));" @click="handleStatsClick">
        <svg class="w-5 h-5 shrink-0 mt-0.5" style="color: hsl(var(--secondary));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
        <div class="flex-1 min-w-0">
          <div class="text-[14px] font-bold mb-1" style="color: hsl(var(--foreground));">看看大家都是什么南方人</div>
          <p class="text-[12px]" style="color: hsl(var(--muted-foreground));">频道内真实人格 & 职业底色分布</p>
        </div>
        <svg class="w-5 h-5 shrink-0 mt-0.5 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" style="color: hsl(var(--muted-foreground));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </button>

      <!-- AI assistant card -->
      <button class="group flex w-full items-start gap-3.5 p-5 mb-3 transition-opacity duration-150 hover:opacity-95 active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-foreground))] text-left" style="background-color: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border-radius: var(--radius);" @click="openAiChat">
        <svg class="w-5 h-5 shrink-0 mt-0.5" style="color: hsl(var(--primary-foreground));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
        <div class="flex-1 min-w-0">
          <div class="text-[14px] font-bold mb-1" style="color: hsl(var(--primary-foreground));">方小楠</div>
          <p class="text-[12px]" style="color: hsl(var(--primary-foreground)); opacity: 0.75;">关于南中和测评结果，随便问</p>
        </div>
        <svg class="w-5 h-5 shrink-0 mt-0.5 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" style="color: hsl(var(--primary-foreground));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </button>

      <!-- Hot feeds (logged in) -->
      <section v-if="isLoggedIn" class="pb-6">
        <h2 class="text-[15px] font-bold mb-4" style="color: hsl(var(--foreground)); letter-spacing: 0.02em;">热门</h2>
        <div v-if="loadingHot" class="gt-card-border p-6 flex items-center justify-center gap-2.5">
          <div class="loading-spinner"></div>
          <span class="text-[13px]" style="color: hsl(var(--muted-foreground));">正在加载热门...</span>
        </div>
        <div v-else-if="!hotFeeds.length" class="gt-card-border p-6 text-center text-[14px]" style="color: hsl(var(--muted-foreground));">暂无帖子</div>
        <div v-else class="gt-card-border p-5">
          <div v-for="f in hotFeeds" :key="f.feed_id" class="feed-row clickable" @click="openFeed(f.feed_id)">
            <div class="feed-title">{{ f.title }}</div>
            <div class="feed-meta">{{ f.author }} · {{ f.channel_name }} · ♥ {{ f.prefer_count }}<template v-if="f.comment_count !== undefined"> · 💬 {{ f.comment_count }}</template></div>
          </div>
        </div>
      </section>

      <!-- My feeds (logged in) -->
      <section v-if="isLoggedIn" class="pb-6">
        <h2 class="text-[15px] font-bold mb-4" style="color: hsl(var(--foreground)); letter-spacing: 0.02em;">我的帖子</h2>
        <div v-if="loadingMy" class="gt-card-border p-6 flex items-center justify-center gap-2.5">
          <div class="loading-spinner"></div>
          <span class="text-[13px]" style="color: hsl(var(--muted-foreground));">正在加载帖子...</span>
        </div>
        <div v-else-if="!myFeeds.length" class="gt-card-border p-6 text-center text-[14px]" style="color: hsl(var(--muted-foreground));">还没有发过帖子 ✨</div>
        <div v-else class="gt-card-border p-5">
          <div v-for="f in myFeeds" :key="f.feed_id" class="feed-row clickable" @click="openFeed(f.feed_id)">
            <div class="feed-title">{{ f.title }}</div>
            <div class="feed-meta">{{ f.channel_name }} · {{ (f.create_time||'').split(' ')[0] }}<template v-if="f.prefer_count !== undefined"> · ♥ {{ f.prefer_count }}</template><template v-if="f.comment_count !== undefined"> · 💬 {{ f.comment_count }}</template></div>
          </div>
        </div>
      </section>

      <!-- Community section -->
      <section class="pt-5 pb-6">
        <p class="text-[14px] text-center mb-5" style="color: hsl(var(--foreground)); font-style: italic;">测完别急着走，扫码回「家」聊聊你的人格</p>
        <div class="flex justify-center gap-5">
          <div class="flex flex-col items-center gap-2.5">
            <div class="qr-frame">
              <img :src="qqQrImg" alt="QQ频道二维码" class="qr-image" />
            </div>
            <span class="text-[11px] font-medium" style="color: hsl(var(--muted-foreground));">QQ 扫码</span>
          </div>
          <div class="flex flex-col items-center gap-2.5">
            <div class="qr-frame">
              <img :src="wxQrImg" alt="微信群二维码" class="qr-image" />
            </div>
            <span class="text-[11px] font-medium" style="color: hsl(var(--muted-foreground));">微信扫码</span>
          </div>
        </div>
      </section>

      <!-- Footer -->
      <footer class="pt-5 border-t" style="border-color: hsl(var(--border));">
        <p class="text-[11px] text-center" style="color: hsl(var(--muted-foreground)); letter-spacing: 0.02em;">v3.4 · <button class="footer-link" @click="showContributors = true">贡献者</button> · <button class="footer-link" @click="router.push('/feedback')">反馈</button> · © 2026 NFTI · 南方人专属</p>
      </footer>

    </div>

    <ChannelAuthModal v-if="showChannelAuth" @unlocked="onUnlocked" @success="onAuthSuccess" @close="showChannelAuth = false" @guest="onGuestLogin" />
    <HomeAiChat v-if="showAiChat" @close="showAiChat = false" />

    <!-- Login prompt modal -->
    <transition name="fade">
      <div v-if="showAiLoginPrompt" class="modal-overlay" @click="handleAiLoginPromptClose">
        <div class="modal" @click.stop>
          <div class="modal-icon">🔒</div>
          <h3>登录后才可使用</h3>
          <p>方小楠问答功能需要绑定QQ频道账号后才能使用。登录后还可保存测试记录、一键分享至频道。</p>
          <div class="modal-actions">
            <button class="modal-btn btn-secondary" @click="handleAiLoginPromptClose">知道了</button>
            <button class="modal-btn btn-primary" @click="showAiLoginPrompt = false; showChannelAuth = true">去登录</button>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="showTestLoginPrompt" class="modal-overlay" @click="handleTestLoginPromptClose">
        <div class="modal" @click.stop>
          <div class="modal-icon">🔒</div>
          <h3>登录后测试记录才会保存</h3>
          <p>当前未登录或游客模式，测试结果不会被保存到个人中心。登录后即可自动保存测试记录，还能一键分享到频道。</p>
          <div class="modal-actions">
            <button class="modal-btn btn-secondary" @click="handleTestLoginPromptClose">知道了，继续</button>
            <button class="modal-btn btn-primary" @click="showTestLoginPrompt = false; showChannelAuth = true">去登录</button>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="showStatsLoginPrompt" class="modal-overlay" @click="handleStatsLoginPromptClose">
        <div class="modal" @click.stop>
          <div class="modal-icon">🔒</div>
          <h3>登录后才可查看</h3>
          <p>人格分布统计需要绑定QQ频道账号后才能查看。登录后还可保存测试记录、一键分享至频道。</p>
          <div class="modal-actions">
            <button class="modal-btn btn-secondary" @click="handleStatsLoginPromptClose">知道了</button>
            <button class="modal-btn btn-primary" @click="showStatsLoginPrompt = false; showChannelAuth = true">去登录</button>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="showStatsGuestPrompt" class="modal-overlay" @click="showStatsGuestPrompt = false">
        <div class="modal" @click.stop>
          <div class="modal-icon">🔒</div>
          <h3>需要QQ频道登录</h3>
          <p>人格分布统计功能需要绑定南方中学QQ频道账号后才能查看。游客模式暂不支持此功能。</p>
          <div class="modal-actions">
            <button class="modal-btn btn-secondary" @click="showStatsGuestPrompt = false">知道了</button>
            <button class="modal-btn btn-primary" @click="showStatsGuestPrompt = false; showChannelAuth = true">去登录</button>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="showJoinGuide" class="modal-overlay" @click="showJoinGuide = false">
        <div class="modal" @click.stop>
          <div class="modal-icon">📢</div>
          <h3>加入南方中学频道</h3>
          <p>你还没有加入南方中学的QQ频道。加入后，你可以：</p>
          <ul class="guide-list"><li>查看频道内的热门帖子</li><li>一键分享测试结果到频道</li><li>使用方小楠问答功能</li></ul>
          <p class="guide-note">如果选择不加入，记录将无法保存至云端，方小楠问答功能暂不可用。</p>
          <div class="modal-actions guide-actions">
            <button class="modal-btn btn-secondary" @click="showJoinGuide = false">不登录，继续使用</button>
            <a href="https://pd.qq.com/g/nanfang1958" target="_blank" class="modal-btn btn-primary" @click="showJoinGuide = false">去加入频道</a>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="showResumeModal" class="modal-overlay" @click="dismissModal">
        <div class="modal" @click.stop>
          <div class="modal-icon">◷</div>
          <h3>恢复上次进度？</h3>
          <p style="font-size:13px;">{{ resumeType === 'holland' ? '霍兰德职业测试' : (resumeMode === 'quick' ? '快速测试' : '完整测试') }} · 已答部分题目</p>
          <div class="modal-actions">
            <button class="modal-btn btn-primary" @click="resumeTest">继续答题</button>
            <button class="modal-btn btn-secondary" @click="dismissModal">重新开始</button>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="showChangelog" class="modal-overlay" @click="showChangelog = false">
        <div class="modal changelog-modal" @click.stop>
          <h3>更新日志</h3>
          <div class="changelog-list">
            <div class="changelog-item">
              <div class="changelog-version">
                <span class="version-tag">v3.4</span>
                <span class="version-date">2026-08-21</span>
              </div>
              <div class="changelog-line">新增默契度测试：</div>
              <div class="changelog-line changelog-line-sub">1. 生成测试结果配对链接</div>
              <div class="changelog-line changelog-line-sub">2. 新增多种解读内容</div>
              <div class="changelog-line changelog-line-sub">3. 支持一键分享默契结果至频道</div>
              <div class="changelog-line" style="margin-top: 6px;">优化玩家体验：</div>
              <div class="changelog-line changelog-line-sub">1. 支持多设备同时登录</div>
              <div class="changelog-line changelog-line-sub">2. 支持跨站鉴权：科创局登录账号后，本站可自动登录</div>
            </div>
            <div class="changelog-item">
              <div class="changelog-version">
                <span class="version-tag">v3.3.2</span>
                <span class="version-date">2026-08-15</span>
              </div>
              <div class="changelog-line">优化玩家体验：</div>
              <div class="changelog-line changelog-line-sub">1. 修复部分同学无法授权登录的问题</div>
              <div class="changelog-line changelog-line-sub">2. 修复部分相同昵称账号绑定的问题</div>
            </div>
            <div class="changelog-item">
              <div class="changelog-version">
                <span class="version-tag">v3.3.1</span>
                <span class="version-date">2026-08-07</span>
              </div>
              <div class="changelog-line">优化玩家体验：</div>
              <div class="changelog-line changelog-line-sub">1. 修复账号频繁登出问题</div>
              <div class="changelog-line changelog-line-sub">2. 修复图鉴图片加载缓慢问题</div>
            </div>
            <div class="changelog-item">
              <div class="changelog-version">
                <span class="version-tag">v3.3</span>
                <span class="version-date"></span>
              </div>
              <ul>
                <li>网站上线频道H5</li>
                <li>优化玩家体验</li>
              </ul>
            </div>
            <div class="changelog-item">
              <div class="changelog-version">
                <span class="version-tag">v3.2</span>
                <span class="version-date"></span>
              </div>
              <ul>
                <li>新增人格图鉴</li>
                <li>优化若干已知问题</li>
              </ul>
            </div>
            <div class="changelog-item">
              <div class="changelog-version"><span class="version-tag">v3.2-alpha</span></div>
              <ul>
                <li>重构职业测评题库</li>
                <li>新增职业测评插图</li>
                <li>优化登录体验</li>
              </ul>
            </div>
            <div class="changelog-item">
              <div class="changelog-version"><span class="version-tag">v3.1-alpha</span></div>
              <ul>
                <li>新增职业测试插画</li>
                <li>AI问答记录持久化储存</li>
                <li>新增AI深度交叉分析</li>
                <li>优化若干已知问题</li>
              </ul>
            </div>
            <div class="changelog-item">
              <div class="changelog-version"><span class="version-tag">v3.0-alpha</span></div>
              <ul>
                <li>新增霍兰德职业兴趣测评</li>
                <li>新增QQ频道登录功能</li>
                <li>新增个人测评记录功能</li>
                <li>优化NFTI题库</li>
              </ul>
            </div>
            <div class="changelog-item">
              <div class="changelog-version"><span class="version-tag">v2.1-alpha</span></div>
              <ul><li>新增一键分享功能（支持分享图片至NFTI版块）</li><li>优化主页布局</li></ul>
            </div>
            <div class="changelog-item">
              <div class="changelog-version"><span class="version-tag">v2.0-beta</span></div>
              <ul><li>开放分享功能</li><li>优化人格插图</li></ul>
            </div>
            <div class="changelog-item">
              <div class="changelog-version"><span class="version-tag">v1.3-alpha</span></div>
              <ul><li>引入方小楠问答功能，基于人格类型提供个性化建议</li><li>支持流式输出</li></ul>
            </div>
            <div class="changelog-item">
              <div class="changelog-version"><span class="version-tag">v1.2-alpha</span></div>
              <ul><li>完成 16 种标准人格的插图设计与展示</li><li>新增人格关系分析</li><li>结果页全新布局</li></ul>
            </div>
            <div class="changelog-item">
              <div class="changelog-version"><span class="version-tag">v1.1-alpha</span></div>
              <ul><li>完成 19 种人格数据全面重构</li><li>新增反馈入口</li><li>优化结果页分数计算与维度解析展示</li></ul>
            </div>
            <div class="changelog-item">
              <div class="changelog-version"><span class="version-tag">v1.0-alpha</span></div>
              <ul><li>完成测试题目与人格设计</li><li>基于南方中学真实校园场景构建八维字母体系</li></ul>
            </div>
          </div>
          <div class="changelog-footer">
            <button class="modal-btn btn-secondary w-full" @click="showChangelog = false">关闭</button>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="showContributors" class="modal-overlay" @click="showContributors = false">
        <div class="modal contributors-modal" @click.stop>
          <h3>贡献者名单</h3>
          <div class="contributors-list">
            <div class="contributor-row"><span class="contributor-role">策划</span><span class="contributor-names">2118 YYW</span></div>
            <div class="contributor-row"><span class="contributor-role">开发</span><span class="contributor-names">2120 DRX</span></div>
            <div class="contributor-row"><span class="contributor-role">设计</span><span class="contributor-names">2120 DRX</span></div>
            <div class="contributor-row"><span class="contributor-role">内测志愿者</span><span class="contributor-names">2117 HJP、2118 YYW、2119 JHT、2119 MYM、2120 YRX、2120 QYH、2317 DZH、2318 LJJ、2520 TYF、2307 LYK、2303 YZYH、2201 CQL</span></div>
            <div class="contributor-row"><span class="contributor-role">数据来源</span><span class="contributor-names"><a href="https://pd.qq.com/g/nanfang1958" target="_blank" rel="noopener noreferrer">腾讯频道</a></span></div>
          </div>
          <div class="modal-actions">
            <button class="modal-btn btn-secondary w-full" @click="showContributors = false">关闭</button>
          </div>
          <div class="repo-link"><a href="https://github.com/Dc-D666/NFTI" target="_blank" rel="noopener noreferrer">GitHub</a></div>
        </div>
      </div>
    </transition>
  </main>
</template>

<style scoped>
/* ---- Buttons ---- */
.gt-btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  padding: 6px 16px;
  transition: opacity 150ms ease;
  background-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-radius: calc(var(--radius) * 0.5);
  border: none;
  cursor: pointer;
}
.gt-btn-primary:hover { opacity: 0.85; }
.gt-btn-primary:active { opacity: 0.75; }

.gt-text-btn {
  background: none;
  border: none;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: color 150ms ease;
}
.gt-text-btn:hover { color: hsl(var(--foreground)); }

/* ---- 最新版本气泡（更新日志按钮下方） ---- */
.version-bubble {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 40;
  background: #ffffff;
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  padding: 8px 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  white-space: nowrap;
  text-align: left;
}
.version-bubble::before {
  content: '';
  position: absolute;
  top: -5px;
  right: 24px;
  width: 9px;
  height: 9px;
  background: #ffffff;
  border-left: 1px solid hsl(var(--border));
  border-top: 1px solid hsl(var(--border));
  transform: rotate(45deg);
}
.version-bubble-line {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.version-bubble-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  flex-shrink: 0;
}
.version-bubble-summary {
  margin-top: 3px;
  font-size: 10.5px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}

/* ---- Cards ---- */
.gt-card-border {
  background-color: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  cursor: pointer;
}

/* ---- Badges ---- */
.gt-badge-muted {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 10px;
  background-color: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  border-radius: 9999px;
}
.gt-badge-accent {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 10px;
  background-color: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
  border-radius: 9999px;
}
.gt-badge-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 10px;
  background-color: hsl(var(--secondary));
  color: hsl(var(--secondary-foreground));
  border-radius: 9999px;
}

/* ---- Avatar / dropdown ---- */
.avatar-btn {
  width: 30px; height: 30px; border-radius: 50%; border: none;
  color: #fff; font-weight: 700; font-size: 12px; cursor: pointer;
}
.dropdown-bg { position: fixed; inset: 0; z-index: 60; }
.dropdown {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 70;
  width: 220px; background: hsl(var(--popover)); border: 1px solid hsl(var(--border));
  border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,.12); overflow: hidden;
}
.pop-enter-active { transition: all .2s ease; }
.pop-leave-active { transition: all .15s ease; }
.pop-enter-from { opacity: 0; transform: translateY(-6px) scale(.96); }
.pop-leave-to { opacity: 0; transform: translateY(-4px) scale(.96); }
.dropdown-head { padding: 18px 16px 12px; text-align: center; }
.dropdown-avatar { width: 44px; height: 44px; border-radius: 50%; margin: 0 auto 6px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; color: #fff; }
.dropdown-name { font-size: 15px; font-weight: 700; color: hsl(var(--foreground)); margin-bottom: 6px; }
.dropdown-tags { display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; }
.dd-tag { font-size: 10px; padding: 2px 8px; background: hsl(var(--muted)); color: hsl(var(--foreground)); border-radius: 20px; }
.dropdown-foot { padding: 8px 14px; border-top: 1px solid hsl(var(--border)); display: flex; gap: 8px; }
.dd-profile { flex: 1; padding: 7px; border: 1px solid hsl(var(--border)); color: hsl(var(--foreground)); border-radius: 8px; font-size: 12px; cursor: pointer; background: hsl(var(--card)); }
.dd-profile:hover { background: hsl(var(--muted)); }
.dd-logout { padding: 7px 14px; background: none; border: 1px solid hsl(var(--destructive) / 0.4); color: hsl(var(--destructive)); border-radius: 8px; font-size: 12px; cursor: pointer; }
.dd-logout:hover { background: hsl(var(--destructive) / 0.1); }

/* ---- Feeds ---- */
.feed-row { padding: 12px 0; border-bottom: 1px solid hsl(var(--border)); }
.feed-row.clickable { cursor: pointer; transition: background 150ms ease; margin: 0 -20px; padding-left: 20px; padding-right: 20px; }
.feed-row.clickable:hover { background: hsl(var(--muted)); }
.feed-row:first-child { padding-top: 0; }
.feed-row:last-child { padding-bottom: 0; border-bottom: none; }
.feed-title { font-size: 14px; font-weight: 600; color: hsl(var(--foreground)); line-height: 1.4; }
.feed-meta { font-size: 12px; color: hsl(var(--muted-foreground)); margin-top: 3px; display: flex; flex-wrap: wrap; gap: 3px; }

/* ---- Loading ---- */
.loading-spinner {
  width: 20px; height: 20px;
  border: 2.5px solid hsl(var(--muted));
  border-top-color: hsl(var(--primary));
  border-radius: 50%; animation: loadSpin .8s linear infinite;
}
@keyframes loadSpin { to { transform: rotate(360deg); } }

/* ---- QR ---- */
.qr-frame {
  width: 104px; height: 104px; border-radius: var(--radius);
  background: hsl(var(--muted)); border: 2px dashed hsl(var(--border));
  display: flex; align-items: center; justify-content: center; padding: 8px;
  transition: transform 200ms var(--ease-out-quint);
}
.qr-frame:hover { transform: scale(1.03); }
.qr-image { width: 100%; height: 100%; border-radius: 8px; object-fit: contain; }

/* ---- Footer link ---- */
.footer-link { font-size: 11px; color: hsl(var(--primary)); background: none; border: none; cursor: pointer; padding: 0; transition: opacity 150ms ease; }
.footer-link:hover { opacity: 0.7; }

/* ---- Debug badge ---- */
.debug-badge { position: absolute; top: 16px; right: 16px; background: hsl(var(--destructive)); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 100px; }

/* ---- Modals ---- */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(31,24,19,0.5); backdrop-filter: blur(8px);
  display: flex; justify-content: center; align-items: center; z-index: 100; padding: 20px;
}
.modal {
  background: hsl(var(--popover)); padding: 32px; border-radius: var(--radius);
  max-width: 360px; width: 100%; text-align: center;
  border: 1px solid hsl(var(--border));
}
.modal-icon { font-size: 32px; color: hsl(var(--primary)); margin-bottom: 12px; opacity: 0.6; }
.modal h3 { font-size: 22px; font-weight: 700; color: hsl(var(--foreground)); margin-bottom: 8px; }
.modal p { font-size: 14px; color: hsl(var(--muted-foreground)); line-height: 1.6; margin-bottom: 24px; }
.modal-actions { display: flex; gap: 12px; }
.modal-btn {
  flex: 1; padding: 12px 16px; border: none; border-radius: calc(var(--radius) * 0.4);
  font-size: 15px; font-weight: 600; cursor: pointer; transition: transform 100ms ease, opacity 150ms ease;
  text-align: center; text-decoration: none; display: inline-flex; align-items: center; justify-content: center;
}
.modal-btn:active { transform: scale(0.97); }
.modal-btn.btn-primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.modal-btn.btn-primary:hover { opacity: 0.9; }
.modal-btn.btn-secondary { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
.modal-btn.btn-secondary:hover { opacity: 0.8; }
.w-full { width: 100%; }
.guide-actions { flex-direction: column; gap: 8px; }
.guide-list { text-align: left; margin: 12px 0; padding-left: 20px; list-style-type: disc; color: hsl(var(--muted-foreground)); font-size: 14px; line-height: 1.8; }
.guide-note { font-size: 13px; color: hsl(var(--muted-foreground)); margin-bottom: 16px; line-height: 1.6; }

.fade-enter-active, .fade-leave-active { transition: opacity 200ms ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ---- Changelog modal ---- */
.changelog-modal { max-width: 440px; max-height: 70vh; text-align: left; display: flex; flex-direction: column; padding: 0; overflow: hidden; }
.changelog-modal h3 { text-align: center; margin-bottom: 0; padding: 24px 24px 16px; flex-shrink: 0; }
.changelog-list { display: flex; flex-direction: column; gap: 20px; padding: 0 24px; overflow-y: auto; flex: 1; }
.changelog-footer { padding: 16px 24px 24px; flex-shrink: 0; }
.changelog-item { padding: 16px; background: hsl(var(--muted) / 0.5); border-radius: var(--radius-sm); }
.changelog-version { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.version-tag { font-size: 13px; font-weight: 700; color: hsl(var(--primary)); background: hsl(var(--accent) / 0.3); padding: 2px 8px; border-radius: 6px; }
.version-date { font-size: 11px; color: hsl(var(--muted-foreground)); margin-left: 8px; }
.changelog-item ul { margin: 0; padding-left: 20px; }
.changelog-item li { font-size: 13px; color: hsl(var(--muted-foreground)); line-height: 1.7; }
.changelog-line { font-size: 13px; color: hsl(var(--muted-foreground)); line-height: 1.7; }
.changelog-line-sub { padding-left: 2em; }

/* ---- Contributors modal ---- */
.contributors-modal { max-width: 420px; }
.contributors-list { text-align: left; margin: 16px 0 24px; display: flex; flex-direction: column; gap: 12px; }
.contributor-row { display: flex; gap: 12px; align-items: flex-start; }
.contributor-role { font-size: 12px; font-weight: 600; color: hsl(var(--primary)); width: 70px; flex-shrink: 0; text-align: right; }
.contributor-names { font-size: 13px; color: hsl(var(--muted-foreground)); line-height: 1.5; flex: 1; }
.contributor-names a { color: hsl(var(--primary)); }
.repo-link { margin-top: 16px; text-align: center; }
.repo-link a { font-size: 12px; color: hsl(var(--muted-foreground)); text-decoration: none; }

/* ---- Beta badge ---- */
/* .beta-badge {
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
  color: #fff; background: linear-gradient(135deg, #f59e0b, #d97706);
  padding: 2px 8px; border-radius: 6px; text-transform: uppercase;
  line-height: 1.6;
} */

/* ---- Responsive ---- */
@media (max-width: 480px) {
  .qr-frame { width: 92px; height: 92px; }
}
</style>
