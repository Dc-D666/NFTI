<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import NftiGalleryView from '@/views/NftiGalleryView.vue'
import HollandGalleryView from '@/views/HollandGalleryView.vue'
import ChannelAuthModal from '@/components/ChannelAuthModal.vue'
import { getStoredSession } from '@/services/channelAuth'
import { dbGetResults, dbGetCollectionStats } from '@/services/channelDb'
import { collectNfti, collectCareers, galleryProgress, collectionPercentile } from '@/services/gallery'

const router = useRouter()
const tab = ref<'nfti' | 'holland'>('nfti')

// 登录门禁：未登录/游客不允许查看图鉴
const showLoginPrompt = ref(false)
const showChannelAuth = ref(false)
const isAuthed = ref(false)

// 收集状态
const collectedNfti = ref<Set<string>>(new Set())
const collectedCareers = ref<Set<string>>(new Set())
const identityReady = ref(false)
const identityDesc = ref('')
// 全站收集分布（用于「超过 xx% 的用户」）
const allNftiCounts = ref<number[]>([])
const allCareerCounts = ref<number[]>([])

const progress = computed(() => galleryProgress(collectedNfti.value, collectedCareers.value))
const nftiPercentile = computed(() => collectionPercentile(progress.value.collectedNfti, allNftiCounts.value))
const careerPercentile = computed(() => collectionPercentile(progress.value.collectedCareers, allCareerCounts.value))

const TABS = [
  { id: 'nfti', label: '🧭 人格图鉴', sub: '16 种标准 + 3 隐藏' },
  { id: 'holland', label: '💼 职业图鉴', sub: '59 个职业' },
] as const

async function loadCollection() {
  const stored = getStoredSession()
  if (!stored?.sessionId || !stored.user?.tinyId) {
    // sessionId 存在但 tinyId 缺失：视为身份不完整，仍结束 loading 状态避免页面卡死
    identityReady.value = true
    identityDesc.value = stored?.user?.nickname || '已登录'
    return
  }
  try {
    const r = await dbGetResults(undefined, stored.user.tinyId)
    if (r.success && r.data) {
      collectedNfti.value = collectNfti(r.data)
      collectedCareers.value = collectCareers(r.data)
    }
    identityDesc.value = stored.user.nickname || '已登录'
  } catch (_) {}
  // 全站收集分布（独立于个人记录，失败不影响展示）
  try {
    const cs = await dbGetCollectionStats()
    if (cs.success && cs.data) {
      allNftiCounts.value = cs.data.nfti_counts || []
      allCareerCounts.value = cs.data.career_counts || []
    }
  } catch (_) {}
  identityReady.value = true
}

onMounted(async () => {
  // 仅 QQ 登录用户可查看图鉴（游客 / 未登录都拦截）
  const stored = getStoredSession()
  if (!stored?.sessionId) {
    showLoginPrompt.value = true
    identityDesc.value = '未登录'
    identityReady.value = true
    return
  }
  isAuthed.value = true
  await loadCollection()
  // 刚测完立刻进入时，dbSaveResult 是 fire-and-forget 可能尚未落库；延迟 1s 再刷新一次补齐
  setTimeout(() => { if (isAuthed.value) loadCollection() }, 1000)
})

function goLogin() {
  showLoginPrompt.value = false
  showChannelAuth.value = true
}
function handleBack() { router.push('/') }
function onAuthSuccess() {
  showChannelAuth.value = false
  const stored = getStoredSession()
  if (stored?.sessionId) {
    isAuthed.value = true
    loadCollection()
  }
}
function onAuthClose() {
  showChannelAuth.value = false
  // 未登录成功就退回登录提示
  if (!getStoredSession()?.sessionId) showLoginPrompt.value = true
}
function onGuestLogin() {
  // 游客模式也不允许查看图鉴，退回登录提示
  showChannelAuth.value = false
  showLoginPrompt.value = true
}
</script>

<template>
  <main class="min-h-screen font-sans antialiased" style="font-family: var(--font-sans);">
    <div class="mx-auto w-full max-w-[560px] px-5 pb-10">

      <!-- Top bar -->
      <header class="flex items-center justify-between py-5">
        <button class="gt-text-btn text-[12px] font-medium" @click="router.push('/')">← 返回首页</button>
        <span class="text-[11px] font-medium uppercase" style="color: hsl(var(--muted-foreground)); letter-spacing: 0.12em;">图鉴</span>
      </header>

      <!-- 收集进度（仅登录可见） -->
      <section v-if="isAuthed" class="pb-5">
        <div class="flex items-center justify-between mb-2">
          <span class="text-[14px] font-bold" style="color: hsl(var(--foreground));">📚 我的收集</span>
          <span class="text-[12px]" style="color: hsl(var(--muted-foreground));">{{ identityDesc }} · {{ identityReady ? '' : '加载中' }}</span>
        </div>
        <div class="flex gap-3">
          <div class="flex-1 p-3 rounded-xl" style="background-color: hsl(var(--card)); border: 1px solid hsl(var(--border));">
            <div class="text-[12px] mb-1" style="color: hsl(var(--muted-foreground));">人格</div>
            <div class="flex items-center gap-2">
              <span class="text-[20px] font-bold tabular-nums" style="color: hsl(var(--foreground));">{{ progress.collectedNfti }}<span class="text-[13px] font-normal" style="color: hsl(var(--muted-foreground));">/{{ progress.totalNfti }}</span></span>
              <div class="flex-1 h-2 rounded-full overflow-hidden" style="background: hsl(var(--muted));">
                <div class="h-full rounded-full transition-all duration-500" :style="{ width: (progress.totalNfti ? (progress.collectedNfti / progress.totalNfti) * 100 : 0) + '%', background: 'linear-gradient(90deg, hsl(var(--primary)), #8b5cf6)' }"></div>
              </div>
            </div>
            <div class="text-[11px] mt-1.5" style="color: hsl(var(--primary)); font-weight: 600;">🏆 超过 {{ nftiPercentile }}% 的用户</div>
          </div>
          <div class="flex-1 p-3 rounded-xl" style="background-color: hsl(var(--card)); border: 1px solid hsl(var(--border));">
            <div class="text-[12px] mb-1" style="color: hsl(var(--muted-foreground));">职业</div>
            <div class="flex items-center gap-2">
              <span class="text-[20px] font-bold tabular-nums" style="color: hsl(var(--foreground));">{{ progress.collectedCareers }}<span class="text-[13px] font-normal" style="color: hsl(var(--muted-foreground));">/{{ progress.totalCareers }}</span></span>
              <div class="flex-1 h-2 rounded-full overflow-hidden" style="background: hsl(var(--muted));">
                <div class="h-full rounded-full transition-all duration-500" :style="{ width: (progress.totalCareers ? (progress.collectedCareers / progress.totalCareers) * 100 : 0) + '%', background: 'linear-gradient(90deg, hsl(var(--primary)), #8b5cf6)' }"></div>
              </div>
            </div>
            <div class="text-[11px] mt-1.5" style="color: hsl(var(--primary)); font-weight: 600;">🏆 超过 {{ careerPercentile }}% 的用户</div>
          </div>
        </div>
        <p v-if="!identityReady" class="text-[11px] mt-2" style="color: hsl(var(--muted-foreground));">正在读取测试记录…</p>
      </section>

      <!-- Tab 切换 -->
      <div class="flex gap-2 mb-5 sticky" style="top: 0; z-index: 10; background: hsl(var(--background) / 0.95); backdrop-filter: blur(8px); padding: 8px 0; border-radius: 12px;">
        <button
          v-for="t in TABS" :key="t.id"
          class="flex-1 py-2.5 rounded-xl transition-all duration-150"
          :style="tab === t.id
            ? { background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700 }
            : { background: 'hsl(var(--card))', color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))' }"
          @click="tab = t.id"
        >
          <span class="text-[13px]">{{ t.label }}</span>
        </button>
      </div>

      <!-- 内容区：嵌入两个图鉴页（隐藏各自顶栏，传入收集状态） -->
      <NftiGalleryView v-if="tab === 'nfti'" embedded :collected="collectedNfti" />
      <HollandGalleryView v-else embedded :collected="collectedCareers" />

    </div>

    <!-- ═══ 登录门禁弹窗 ═══ -->
    <transition name="fade">
      <div v-if="showLoginPrompt" class="modal-overlay">
        <div class="modal" @click.stop>
          <div class="modal-icon">🔒</div>
          <h3>登录后才能查看图鉴</h3>
          <p>图鉴需要绑定 QQ 频道账号后才能查看。登录后，测出的人格与推荐职业会自动收录进你的图鉴。</p>
          <div class="modal-actions">
            <button class="modal-btn btn-secondary" @click="handleBack">返回首页</button>
            <button class="modal-btn btn-primary" @click="goLogin">去登录</button>
          </div>
        </div>
      </div>
    </transition>

    <ChannelAuthModal
      v-if="showChannelAuth"
      @success="onAuthSuccess"
      @close="onAuthClose"
      @guest="onGuestLogin"
    />
  </main>
</template>

<style scoped>
.gt-text-btn { background: none; border: none; color: hsl(var(--muted-foreground)); cursor: pointer; transition: color 150ms ease; }
.gt-text-btn:hover { color: hsl(var(--foreground)); }
</style>
