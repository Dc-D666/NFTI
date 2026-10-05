<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useTestStore } from '@/stores/testStore'
import { counter } from '@/utils/counter'
import { getRelations } from '@/data/relationships'
import { computed, onMounted, ref } from 'vue'
import type { RelationEntry } from '@/data/relationships'
import AiChatModal from '@/components/AiChatModal.vue'
import ShareModal from '@/components/ShareModal.vue'
import CrossAnalysisCard from '@/components/CrossAnalysisCard.vue'
import AICrossAnalysisCard from '@/components/AICrossAnalysisCard.vue'
import { getStoredSession, checkSession, getGuestSession } from '@/services/channelAuth'
import { dbCrossCheck, dbGetResults, dbSaveResult, shareCreate } from '@/services/channelDb'
import { hollandRoles } from '@/assessments/holland/roles'
import type { NftiForCross, HollandForCross } from '@/services/crossAnalysis'
import { getNftiIllustration } from '@/utils/illustrations'

const route = useRoute()
const router = useRouter()
const store = useTestStore()

const mode = computed(() => route.params.mode as string)
const result = computed(() => store.result)
const isDebug = computed(() => mode.value === 'debug')

// 插图统一走 @/utils/illustrations（优先压缩 JPG，缺码回退原 PNG）

// 计数
const completeCount = ref(0)
const typeCount = ref(0)
const showAiChat = ref(false)
const showAiLoginPrompt = ref(false)
const showShare = ref(false)
const isLoggedIn = ref(false)
const crossHolland = ref<{ code: string; name: string } | null>(null)
const hollandFullResult = ref<HollandForCross | null>(null)

const nftiForCross = computed<NftiForCross | null>(() => {
  if (!result.value) return null
  return {
    typeCode: result.value.type.code,
    typeName: result.value.type.name,
    fourLetter: result.value.type.fourLetter || null,
    scores: result.value.scores,
    mode: result.value.mode,
    description: result.value.type.description,
    detail: result.value.type.detail || '',
  }
})
const shareSessionId = computed(() => getStoredSession()?.sessionId || '')

function handleAiChatClick() {
  const stored = getStoredSession()
  if (!stored?.sessionId) { showAiLoginPrompt.value = true; return }
  showAiChat.value = true
}
function handleAiLoginPromptClose() { showAiLoginPrompt.value = false }

// 撒花动画
const showConfetti = ref(true)
const confettiCanvas = ref<HTMLCanvasElement | null>(null)

interface ConfettiParticle {
  x: number
  y: number
  r: number
  dx: number
  dy: number
  color: string
  tilt: number
  tiltAngle: number
  tiltAngleIncremental: number
}

function startConfetti() {
  const canvas = confettiCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const width = window.innerWidth
  const height = window.innerHeight
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = width + 'px'
  canvas.style.height = height + 'px'
  ctx.scale(dpr, dpr)

  // GT 暖色系撒花配色
  const colors: string[] = [
    '#9C8B6A', '#BBA888', '#D8CFBE', '#E4DDCD',
    '#FBBF24', '#FCD34D', '#FDE68A',
    '#6E5F48', '#4D4031', '#2E2219',
    '#D97706', '#B45309',
  ]

  const particles: ConfettiParticle[] = []
  const particleCount = 120

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height * 0.5 - height * 0.5,
      r: Math.random() * 4 + 2,
      dx: Math.random() * 2 - 1,
      dy: Math.random() * 2 + 1,
      color: colors[Math.floor(Math.random() * colors.length)]!,
      tilt: Math.random() * 10,
      tiltAngle: Math.random() * 10,
      tiltAngleIncremental: Math.random() * 0.07 + 0.05,
    })
  }

  let animationId: number
  let elapsed = 0
  const duration = 3000 // 3秒

  function draw() {
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    elapsed += 16

    particles.forEach((p) => {
      p.tiltAngle += p.tiltAngleIncremental
      p.y += (Math.cos(p.tiltAngle) + 1 + p.r / 2) / 2
      p.x += Math.sin(p.tiltAngle) * 2
      p.tilt = Math.sin(p.tiltAngle) * 15

      ctx!.beginPath()
      ctx!.lineWidth = p.r / 2
      ctx!.strokeStyle = p.color
      ctx!.moveTo(p.x + p.tilt + p.r / 3, p.y)
      ctx!.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 5)
      ctx!.stroke()
    })

    if (elapsed < duration) {
      animationId = requestAnimationFrame(draw)
    } else {
      showConfetti.value = false
    }
  }

  draw()

  // 清理
  setTimeout(() => {
    cancelAnimationFrame(animationId)
  }, duration + 100)
}

// 人格关系数据
const relations = computed<RelationEntry[]>(() => {
  if (!result.value) return []
  return getRelations(result.value.type.code)
})

onMounted(() => {
  // 刷新/直达时 store 为空 → 尝试从 sessionStorage 快照恢复
  if (!store.isComplete || store.mode !== mode.value) {
    const restored = store.restoreResultSnapshot()
    if (!restored || restored.mode !== mode.value) {
      router.push('/')
      return
    }
  }
  // 启动撒花动画
  startConfetti()
  // 增加完成计数和类型计数
  counter.hitComplete().then((n) => {
    completeCount.value = n
  })
  if (result.value?.type.code) {
    counter.hitType(result.value.type.code).then((n) => {
      typeCount.value = n
    })
  }
  // 检查QQ频道登录状态
  const stored = getStoredSession()
  if (stored?.sessionId) {
    isLoggedIn.value = true
  }
  // 交叉分析：检查是否有霍兰德结果，有则取完整数据
  if (stored?.user?.tinyId && result.value?.mode !== 'quick') {
    dbCrossCheck(stored.user.tinyId).then(r => {
      if (r.success && r.data.hasHolland && r.data.hollandResult) {
        crossHolland.value = { code: r.data.hollandResult.type_code, name: r.data.hollandResult.type_name }
        // 获取完整霍兰德数据（含各维度得分）
        dbGetResults(undefined, stored.user!.tinyId).then(hist => {
          if (hist.success && hist.data) {
            const hollandResults = hist.data.filter((t: any) => t.assessment_type === 'holland')
            if (hollandResults.length > 0) {
              const latest = hollandResults[0]
              const code = (latest.type_code || '') as string
              const scores = latest.scores || {}
              const dims = code.split('').slice(0, 3)
              const roles = dims.map(d => {
                const role = (hollandRoles as Record<string, any>)[d]
                return { dimension: d, name: role?.name || d, emoji: role?.emoji || '❓' }
              })
              hollandFullResult.value = {
                code,
                primary: dims[0] || '',
                secondary: dims[1] || '',
                tertiary: dims[2] || '',
                scores,
                roles,
              }
            }
          }
        }).catch(() => {})
      }
    }).catch(() => {})
  }
})

function restart() {
  const wasDebug = isDebug.value
  store.reset()
  if (wasDebug) {
    router.push('/test/debug/1')
  } else {
    router.push('/')
  }
}

function exitDebug() {
  store.reset()
  router.push('/')
}

function share() {
  showShare.value = true
  // 静默尝试把默契分享链接印到分享卡片上（已登录时），失败不影响分享
  const stored = getStoredSession()
  if (!stored?.sessionId) return
  const currentCode = result.value?.type?.code || ''
  dbGetResults(undefined, stored.user.tinyId, undefined).then(hist => {
    const list = (hist?.data || []).filter((t: any) => (t.assessment_type || 'nfti') === 'nfti' && t.mode !== 'debug' && t.tiny_id)
    // 仅当存在与当前展示结果类型一致的记录才印链接（避免游客先测后登录时把旧链接印到当前卡片）
    const matched = list.find((t: any) => t.type_code === currentCode)
    if (matched) {
      shareCreate(matched.id).then(res => {
        if (res.success && res.code) {
          matchShareCode.value = res.code
          matchShareUrl.value = res.url || (window.location.origin + '/match?code=' + res.code)
        }
      }).catch(() => {})
    }
  }).catch(() => {})
}

// ─── 默契度分享（NFTI，全部走分享链接）───
const matchShareCode = ref('')
const matchShareUrl = ref('')
const matchShareLoading = ref(false)
const matchShareError = ref('')
const showMatchShare = ref(false)
const matchCopied = ref(false)
async function openMatchShare() {
  const stored = getStoredSession()
  if (!stored?.sessionId) {
    // 与 Holland 结果页一致：直接弹窗提示登录（不复用"方小楠问答"引导，文案不符）
    matchShareError.value = '默契分享需要登录 QQ 频道账号，请先在首页登录'
    showMatchShare.value = true
    return
  }
  matchShareLoading.value = true
  matchShareError.value = ''
  try {
    const currentCode = result.value?.type?.code || ''
    let resultId = ''
    const hist = await dbGetResults(undefined, stored.user.tinyId, undefined)
    const list = (hist?.data || []).filter((t: any) => (t.assessment_type || 'nfti') === 'nfti' && t.mode !== 'debug')
    // 优先用与当前展示结果一致的记录（分享码必须对应当前这张结果）
    const matched = list.find((t: any) => t.type_code === currentCode && t.tiny_id)
    if (matched) {
      resultId = matched.id
    } else {
      // 无匹配记录（游客先测后登录 / 保存失败）→ 用当前内存结果重存绑定账号
      const saved = await dbSaveResult({
        assessment_type: 'nfti', tiny_id: stored.user.tinyId, mode: result.value?.mode || 'full',
        type_code: currentCode, type_name: result.value?.type?.name || currentCode,
        scores: result.value?.scores || {}, answers: [],
      })
      resultId = saved?.data?.id || ''
    }
    if (!resultId) { matchShareError.value = '生成失败，请重试'; showMatchShare.value = true; return }
    const res = await shareCreate(resultId)
    if (!res.success || !res.code) { matchShareError.value = res.error || '生成失败'; showMatchShare.value = true; return }
    matchShareCode.value = res.code
    matchShareUrl.value = res.url || (window.location.origin + '/match?code=' + res.code)
    matchShareError.value = ''
    showMatchShare.value = true
  } catch (e: any) {
    matchShareError.value = e?.message || '生成失败'
    showMatchShare.value = true
  } finally {
    matchShareLoading.value = false
  }
}

async function copyMatchShare() {
  try { await navigator.clipboard.writeText(matchShareUrl.value) } catch { /* ignore */ }
  matchCopied.value = true
  setTimeout(() => (matchCopied.value = false), 2000)
}

const dimensionPairs = computed(() => {
  if (!result.value) return []
  const s = result.value.scores
  return [
    { label: '社交电量', left: 'O 充电型', right: 'R 省电型', leftScore: s.E, rightScore: s.I, codeLeft: 'O', codeRight: 'R' },
    { label: '信息偏好', left: 'G 显微镜', right: 'V 望远镜', leftScore: s.S, rightScore: s.N, codeLeft: 'G', codeRight: 'V' },
    { label: '决策风格', left: 'L 讲道理', right: 'E 讲感情', leftScore: s.T, rightScore: s.F, codeLeft: 'L', codeRight: 'E' },
    { label: '生活节奏', left: 'S 课表型', right: 'F 随心型', leftScore: s.J, rightScore: s.P, codeLeft: 'S', codeRight: 'F' },
  ]
})

function getLetterClass(letter: string) {
  // MBTI -> NFTI 映射
  const map: Record<string, string> = {
    'E': 'letter-o', 'I': 'letter-r',
    'S': 'letter-g', 'N': 'letter-v',
    'T': 'letter-l', 'F': 'letter-e',
    'J': 'letter-s', 'P': 'letter-f',
  }
  return map[letter] || ''
}

function getNFTILetter(mbtiLetter: string): string {
  const map: Record<string, string> = {
    'E': 'O', 'I': 'R',
    'S': 'G', 'N': 'V',
    'T': 'L', 'F': 'E',
    'J': 'S', 'P': 'F',
  }
  return map[mbtiLetter] || mbtiLetter
}

function getDimensionInfo(leftScore: number, rightScore: number, mode: string) {
  const diff = leftScore - rightScore
  // 快速测试：每维度3题 * 3分 = 9分最大差距
  // 完整测试：每维度12题 * 3分 = 36分最大差距
  const maxPossibleDiff = mode === 'quick' ? 9 : 36
  const intensity = Math.min(Math.abs(diff) / maxPossibleDiff, 1)

  // 主导侧百分比 = 50% + 倾向强度 * 50%
  // 劣势侧百分比 = 100% - 主导侧百分比
  // 两侧之和始终 = 100%
  const dominantPct = Math.round(50 + intensity * 50)
  const weakPct = 100 - dominantPct

  const winner = diff >= 0 ? 'left' : 'right'
  const diffAbs = Math.abs(diff)

  return {
    leftPct: diff >= 0 ? dominantPct : weakPct,
    rightPct: diff >= 0 ? weakPct : dominantPct,
    winner,
    diffAbs,
  }
}

// 关系类型 -> badge 配色映射（对应设计稿）
function getRelationBadgeClass(type: string) {
  switch (type) {
    case '绝配': return 'rel-badge-accent'
    case '天敌': return 'rel-badge-destructive'
    case '孽缘': return 'rel-badge-secondary'
    case '专克': return 'rel-badge-muted'
    default: return 'rel-badge-muted'
  }
}
</script>

<template>
  <main v-if="result" class="min-h-screen font-sans antialiased" style="font-family: var(--font-sans);">
    <!-- 撒花动画层 -->
    <canvas v-if="showConfetti" ref="confettiCanvas" class="confetti-canvas"></canvas>

    <div class="mx-auto max-w-[560px] px-5 py-5 flex flex-col gap-3.5">

      <!-- 1. Top bar -->
      <header class="flex items-center justify-between">
        <button class="group inline-flex items-center gap-1.5 text-[14px] font-medium transition-opacity duration-150 hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style="color: hsl(var(--muted-foreground)); border-radius: calc(var(--radius) * 0.5); --tw-ring-color: hsl(var(--ring));"
          @click="router.push('/')">
          <svg class="w-5 h-5 transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transition-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          <span class="whitespace-nowrap">返回首页</span>
        </button>
        <button class="group inline-flex items-center gap-1.5 text-[14px] font-medium transition-opacity duration-150 hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style="color: hsl(var(--muted-foreground)); border-radius: calc(var(--radius) * 0.5); --tw-ring-color: hsl(var(--ring));"
          @click="router.push({ path: '/feedback', query: { from: 'result' } })">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 21h8"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
          <span class="whitespace-nowrap">反馈</span>
        </button>
      </header>

      <!-- 2. Mode label -->
      <p class="text-[11px] font-semibold" :class="{ 'debug-label': isDebug }" style="color: hsl(var(--muted-foreground)); letter-spacing: 0.12em; text-transform: uppercase;">
        {{ isDebug ? 'DEBUG 结果' : result.mode === 'quick' ? '快速测试结果' : '完整测试结果' }}
      </p>

      <!-- 3. Type display card -->
      <section class="relative overflow-hidden p-6 type-card"
        :class="{ 'type-card-hidden': result.type.isHidden }"
        style="background-color: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius);">

        <!-- NFTI 四字母便利贴（仅完整测试显示） -->
        <div v-if="result.mode !== 'quick' && result.type.fourLetter && !result.type.isHidden" class="nfti-sticker">
          <div class="sticker-tape"></div>
          <div class="sticker-content">
            <span class="sticker-letter" v-for="(letter, idx) in result.type.fourLetter.split('')" :key="idx" :class="getLetterClass(letter)">{{ getNFTILetter(letter) }}</span>
          </div>
        </div>

        <!-- 文字信息 -->
        <h1 class="font-bold leading-none"
          style="font-size: clamp(44px, 14vw, 68px); color: hsl(var(--foreground)); letter-spacing: -0.02em; text-wrap: balance; word-break: keep-all; overflow-wrap: break-word;">{{ result.type.code }}</h1>
        <p class="font-bold leading-tight mt-1.5" style="font-size: 30px; color: hsl(var(--primary)); font-style: italic;">{{ result.type.name }}</p>
        <p v-if="result.type.code === 'BANDIT'" class="text-[12px] mt-1" style="color: hsl(var(--muted-foreground)); font-style: italic;">该梗出自某强基班班主任对某年级主任取的外号</p>

        <!-- 隐藏款徽章 -->
        <div v-if="result.type.isHidden" class="hidden-badge">
          <span class="badge-star" aria-hidden="true">✦</span>
          隐藏款
          <span class="badge-star" aria-hidden="true">✦</span>
        </div>
        <div v-if="result.type.isHidden && result.type.unlockCondition" class="unlock-condition">
          解锁条件：{{ result.type.unlockCondition }}
        </div>
      </section>

      <!-- 插图（仅完整测试显示，独立卡片） -->
      <section v-if="result.mode !== 'quick'" class="type-hero">
        <img v-if="result.type.illustration" :src="getNftiIllustration(result.type.illustration)" :alt="result.type.name" class="type-illustration" />
        <div v-else class="type-illustration-placeholder">
          <span>{{ result.type.code[0] }}</span>
        </div>
      </section>

      <!-- 4. Description card -->
      <section class="p-6 relative" style="background-color: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius);">
        <p class="leading-[1.85]" style="font-size: 16px; color: hsl(var(--foreground));">
          <span class="quote-mark" style="font-size: 32px; line-height: 1; color: hsl(var(--accent)); vertical-align: -5px; font-style: italic;">"</span>{{ result.type.description }}
        </p>
      </section>

      <!-- 5. Detail section -->
      <section v-if="result.type.detail" class="p-6" style="background-color: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius);">
        <h2 class="font-bold mb-2.5" style="font-size: 16px; color: hsl(var(--primary)); letter-spacing: 0.02em;">你是这样的人</h2>
        <p class="text-[14px] leading-[1.75]" style="color: hsl(var(--foreground));">{{ result.mode === 'quick' ? (result.type.detail.length > 100 ? result.type.detail.slice(0, 100) + '...' : result.type.detail) : result.type.detail }}</p>
      </section>

      <!-- 6. Dimensions section (完整测试和 Debug 模式) -->
      <section v-if="result.mode === 'full' || result.mode === 'debug'" class="p-6" style="background-color: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius);">
        <h2 class="font-bold mb-5" style="font-size: 18px; color: hsl(var(--foreground)); letter-spacing: 0.02em;">四维解析</h2>
        <div class="flex flex-col gap-4">

          <div
            v-for="(pair, idx) in dimensionPairs"
            :key="pair.label"
            class="dim-row flex flex-col gap-2"
            :style="{ '--i': idx }"
          >
            <span class="text-[11px] font-semibold" style="color: hsl(var(--muted-foreground)); letter-spacing: 0.1em; text-transform: uppercase;">{{ pair.label }}</span>
            <div class="flex items-center justify-between">
              <span class="text-[14px] whitespace-nowrap" :style="{ color: pair.leftScore >= pair.rightScore ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))', fontWeight: pair.leftScore >= pair.rightScore ? 500 : 400 }">
                {{ pair.left }} <span class="font-bold" :style="{ color: pair.leftScore >= pair.rightScore ? 'hsl(var(--primary))' : 'inherit' }">{{ getDimensionInfo(pair.leftScore, pair.rightScore, result.mode).leftPct }}%</span>
              </span>
              <span class="text-[14px] whitespace-nowrap" :style="{ color: pair.rightScore > pair.leftScore ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))', fontWeight: pair.rightScore > pair.leftScore ? 500 : 400 }">
                {{ pair.right }} <span class="font-bold" :style="{ color: pair.rightScore > pair.leftScore ? 'hsl(var(--primary))' : 'inherit' }">{{ getDimensionInfo(pair.leftScore, pair.rightScore, result.mode).rightPct }}%</span>
              </span>
            </div>
            <div class="relative overflow-hidden" style="height: 8px; border-radius: 9999px; background-color: hsl(var(--muted));">
              <!-- 主导侧 -->
              <div
                v-if="pair.leftScore >= pair.rightScore"
                class="absolute inset-y-0 left-0"
                :style="{ width: getDimensionInfo(pair.leftScore, pair.rightScore, result.mode).leftPct + '%', backgroundColor: 'hsl(var(--primary))', borderRadius: '9999px' }"
              ></div>
              <div
                v-else
                class="absolute inset-y-0 left-0"
                :style="{ width: getDimensionInfo(pair.leftScore, pair.rightScore, result.mode).leftPct + '%', backgroundColor: 'hsl(var(--border))', borderRadius: '9999px' }"
              ></div>
              <!-- 劣势侧 -->
              <div
                v-if="pair.leftScore >= pair.rightScore"
                class="absolute inset-y-0 right-0"
                :style="{ width: getDimensionInfo(pair.leftScore, pair.rightScore, result.mode).rightPct + '%', backgroundColor: 'hsl(var(--border))', borderRadius: '9999px' }"
              ></div>
              <div
                v-else
                class="absolute inset-y-0 right-0"
                :style="{ width: getDimensionInfo(pair.leftScore, pair.rightScore, result.mode).rightPct + '%', backgroundColor: 'hsl(var(--primary))', borderRadius: '9999px' }"
              ></div>
              <!-- 中心线 -->
              <div class="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px" style="background-color: hsl(var(--foreground)); opacity: 0.15;"></div>
            </div>
          </div>

        </div>
      </section>

      <!-- 快速测试引导 -->
      <section v-if="result.mode === 'quick'" class="upgrade-prompt">
        <div class="prompt-icon" aria-hidden="true">✦</div>
        <h3 class="upgrade-title">解锁更完整的自己</h3>
        <div class="compare-table">
          <div class="compare-header">
            <div class="compare-col">维度</div>
            <div class="compare-col">快速测试</div>
            <div class="compare-col compare-highlight">完整测试</div>
          </div>
          <div class="compare-row">
            <div class="compare-col">题目数量</div>
            <div class="compare-col">12 题</div>
            <div class="compare-col compare-highlight">48 题</div>
          </div>
          <div class="compare-row">
            <div class="compare-col">人格精度</div>
            <div class="compare-col">4 种概括型</div>
            <div class="compare-col compare-highlight">16 种标准 + 3 款隐藏</div>
          </div>
          <div class="compare-row">
            <div class="compare-col">维度解析</div>
            <div class="compare-col">基础倾向</div>
            <div class="compare-col compare-highlight">四维深度解析</div>
          </div>
          <div class="compare-row">
            <div class="compare-col">人格插图</div>
            <div class="compare-col">—</div>
            <div class="compare-col compare-highlight">专属插画展示</div>
          </div>
          <div class="compare-row">
            <div class="compare-col">关系图谱</div>
            <div class="compare-col">—</div>
            <div class="compare-col compare-highlight">绝配 / 天敌 / 专克</div>
          </div>
          <div class="compare-row">
            <div class="compare-col">AI 顾问</div>
            <div class="compare-col">—</div>
            <div class="compare-col compare-highlight">个性化深度问答</div>
          </div>
        </div>
        <button class="upgrade-btn" @click="router.push('/test/full/1')">开始完整测试</button>
        <p class="upgrade-free"><br>全部功能免费、无广告</p>
        <p class="upgrade-free">动动手指，邀请同学加入频道一起玩吧~</p>
      </section>

      <!-- 7. Relations section -->
      <section v-if="relations.length > 0" class="p-6" style="background-color: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius);">
        <h2 class="font-bold mb-5" style="font-size: 18px; color: hsl(var(--foreground)); letter-spacing: 0.02em;">人格关系图谱</h2>

        <!-- 快速测试：神秘卡片 -->
        <div v-if="result.mode === 'quick'" class="flex flex-col gap-4">
          <div v-for="n in 4" :key="n" class="mystery-card flex flex-col gap-2">
            <div class="mystery-badge inline-flex items-center justify-center text-[11px] font-bold whitespace-nowrap px-2.5 py-0.5">???</div>
            <div class="flex items-center gap-2.5 flex-wrap">
              <span class="text-[14px] font-bold" style="color: hsl(var(--muted-foreground));">????</span>
              <span class="text-[14px]" style="color: hsl(var(--muted-foreground)); font-style: italic;">???</span>
            </div>
            <p class="text-[13px] leading-[1.65]" style="color: hsl(var(--muted-foreground));">完成完整测试解锁人格关系分析</p>
          </div>
        </div>

        <!-- 完整测试：真实关系 -->
        <div v-else class="flex flex-col gap-4">
          <template v-for="(rel, idx) in relations" :key="idx">
            <div v-if="idx > 0" class="relation-divider"></div>
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-2.5 flex-wrap">
                <span class="relation-badge inline-flex items-center justify-center text-[11px] font-bold whitespace-nowrap px-2.5 py-0.5"
                  :class="getRelationBadgeClass(rel.type)">{{ rel.type }}</span>
                <span class="text-[14px] font-bold" style="color: hsl(var(--foreground));">{{ rel.targetNfti }}</span>
                <span class="text-[14px]" style="color: hsl(var(--muted-foreground)); font-style: italic;">{{ rel.targetName }}</span>
              </div>
              <p class="text-[13px] leading-[1.65]" style="color: hsl(var(--muted-foreground));">{{ rel.desc }}</p>
            </div>
          </template>
        </div>
      </section>

      <!-- 交叉画像（完整测试 + 有霍兰德记录时显示） -->
      <section v-if="result.mode !== 'quick'" class="cross-section">
        <!-- AI 深度交叉分析（两个测试都完成，且已获取完整分数） -->
        <AICrossAnalysisCard
          v-if="nftiForCross && hollandFullResult"
          :nfti="nftiForCross"
          :holland="hollandFullResult"
          :user-tiny-id="getStoredSession()?.user?.tinyId"
          :user-guest-id="getGuestSession()?.guestId"
        />
        <!-- 静态占位卡片（仅完成一个测试时提示用户） -->
        <CrossAnalysisCard
          v-else
          side="nfti"
          :code="result.type.code"
          :cross-code="crossHolland?.code"
          :cross-name="crossHolland?.name"
        />
      </section>

      <!-- 8. AI card (仅完整测试显示) -->
      <a v-if="result.mode !== 'quick'" href="#" class="group flex items-center gap-3.5 p-5 transition-opacity duration-150 hover:opacity-95 active:opacity-90 focus-visible:outline-none focus-visible:ring-2"
        style="background-color: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border-radius: var(--radius); --tw-ring-color: hsl(var(--primary-foreground));"
        @click.prevent="handleAiChatClick">
        <svg class="w-6 h-6 flex-none" style="color: hsl(var(--primary-foreground));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" x2="12.01" y1="17" y2="17"/>
        </svg>
        <div class="flex-1 min-w-0">
          <p class="text-[14px] font-bold" style="color: hsl(var(--primary-foreground));">问问方小楠</p>
          <p class="text-[12px] mt-0.5 leading-snug" style="color: hsl(var(--primary-foreground)); opacity: 0.75;">基于你的 {{ result.type.name }} 人格，获取个性化建议</p>
        </div>
        <svg class="w-5 h-5 flex-none transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" style="color: hsl(var(--primary-foreground));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </a>

      <!-- 9. Action buttons -->
      <div class="flex gap-3 pt-1">
        <button class="group flex-1 inline-flex items-center justify-center gap-2 h-12 text-[14px] font-medium whitespace-nowrap transition-all duration-150 hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]"
          style="background-color: hsl(var(--muted)); color: hsl(var(--foreground)); border-radius: calc(var(--radius) * 0.5); --tw-ring-color: hsl(var(--ring));"
          @click="share">
          <svg class="w-4 h-4" style="color: hsl(var(--foreground));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z"/><path d="M6 12h16"/></svg>
          <span>分享结果</span>
        </button>
        <button class="group flex-1 inline-flex items-center justify-center gap-2 h-12 text-[14px] font-medium whitespace-nowrap transition-all duration-150 hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]"
          style="background-color: #fef3c7; color: #b45309; border-radius: calc(var(--radius) * 0.5); --tw-ring-color: hsl(var(--ring));"
          :disabled="matchShareLoading"
          @click="openMatchShare">
          <span class="text-[14px]">💞 {{ matchShareLoading ? '生成中...' : '默契分享' }}</span>
        </button>
        <button class="group flex-1 inline-flex items-center justify-center gap-2 h-12 text-[14px] font-semibold whitespace-nowrap transition-all duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]"
          style="background-color: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border-radius: calc(var(--radius) * 0.5); --tw-ring-color: hsl(var(--primary-foreground));"
          @click="restart">
          <svg class="w-4 h-4" style="color: hsl(var(--primary-foreground));" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          <span>{{ isDebug ? '重新测试（Debug）' : '重新测试' }}</span>
        </button>
      </div>

    </div>

    <!-- AI 对话弹窗 -->
    <AiChatModal
      v-if="showAiChat && result"
      :personality-code="result.type.code"
      :personality-name="result.type.name"
      :four-letter="result.type.fourLetter"
      :description="result.type.description"
      :detail="result.type.detail || ''"
      :scores="result.scores"
      :mode="result.mode"
      @close="showAiChat = false"
    />

    <!-- 分享弹窗 -->
    <ShareModal
      v-if="result"
      :show="showShare"
      :mode="result.mode"
      :type="result.type"
      :scores="result.scores"
      :illustration-url="getNftiIllustration(result.type.illustration)"
      :is-logged-in="isLoggedIn"
      :session-id="shareSessionId"
      :match-url="matchShareUrl"
      @close="showShare = false"
    />
  
    <!-- 登录引导弹窗 -->
    <div v-if="showAiLoginPrompt" class="modal-overlay" @click="handleAiLoginPromptClose">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>登录QQ频道</h3>
          <button class="close-btn" @click="handleAiLoginPromptClose">&times;</button>
        </div>
        <div class="modal-body">
          <p>方小楠问答功能需要绑定QQ频道账号后才能使用。</p>
          <p>登录后还可保存测试记录、一键分享至频道。</p>
          <div class="modal-actions">
            <button class="modal-btn btn-primary" @click="showAiLoginPrompt = false; router.push('/')">去登录</button>
            <button class="modal-btn btn-ghost" @click="handleAiLoginPromptClose">取消</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 默契分享弹窗 -->
    <div v-if="showMatchShare" class="modal-overlay" @click="showMatchShare = false">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>💞 你的默契分享链接</h3>
          <button class="close-btn" @click="showMatchShare = false">&times;</button>
        </div>
        <div class="modal-body">
          <p v-if="matchShareError" class="text-[14px] mb-2" style="color: #e11d48;">😵 {{ matchShareError }}</p>
          <template v-else>
            <p class="text-[13px] mb-2" style="color: hsl(var(--muted-foreground));">把这个链接发给朋友，TA 点开就能和你算默契度</p>
            <div class="match-code-box" style="font-size: 13px; word-break: break-all; text-align: center; padding: 14px; border-radius: 10px; background: hsl(var(--muted)); margin: 10px 0; line-height: 1.6;">{{ matchShareUrl }}</div>
            <p class="text-[12px] mb-3" style="color: hsl(var(--muted-foreground));">分享链接 30 天内有效，可随时在个人中心停用</p>
            <div class="modal-actions" style="flex-wrap: wrap;">
              <button class="modal-btn btn-primary" @click="copyMatchShare">{{ matchCopied ? '已复制 ✓' : '复制分享链接' }}</button>
              <button class="modal-btn btn-ghost" @click="showMatchShare = false">完成</button>
            </div>
          </template>
        </div>
      </div>
    </div>

</main>
</template>

<style scoped>
/* ---- Confetti ---- */
.confetti-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 999;
}

/* ---- Debug label ---- */
.debug-label {
  color: hsl(var(--destructive)) !important;
  font-weight: 700 !important;
}

/* ---- Type card ---- */
.type-card-hidden {
  position: relative;
}
.type-card-hidden::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, hsl(var(--accent) / 0.15), transparent 60%);
  pointer-events: none;
  border-radius: var(--radius);
}

/* ---- NFTI Sticker (兼容旧实现) ---- */
.nfti-sticker {
  position: absolute;
  top: -12px;
  right: 20px;
  background: hsl(var(--accent) / 0.6);
  padding: 6px 12px;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  transform: rotate(3deg);
  z-index: 10;
}
.sticker-tape {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  width: 32px;
  height: 14px;
  background: hsl(var(--muted) / 0.7);
  border: 1px solid hsl(var(--border));
  border-radius: 2px;
}
.sticker-content {
  display: flex;
  gap: 2px;
  justify-content: center;
}
.sticker-letter {
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 700;
  width: 20px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}
.letter-o { background: hsl(var(--accent)); color: hsl(var(--accent-foreground)); }
.letter-r { background: hsl(var(--secondary)); color: hsl(var(--secondary-foreground)); }
.letter-g { background: hsl(var(--accent) / 0.7); color: hsl(var(--accent-foreground)); }
.letter-v { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
.letter-l { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.letter-e { background: hsl(var(--destructive)); color: hsl(var(--destructive-foreground)); }
.letter-s { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
.letter-f { background: hsl(var(--accent) / 0.5); color: hsl(var(--accent-foreground)); }

/* ---- Hidden badge ---- */
.hidden-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 8px 16px;
  background: linear-gradient(135deg, hsl(var(--accent)), hsl(var(--accent) / 0.8));
  color: hsl(var(--accent-foreground));
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  position: relative;
  z-index: 1;
  animation: badgePulse 2s ease-in-out infinite;
}
.badge-star {
  font-size: 12px;
  opacity: 0.9;
}
.unlock-condition {
  margin-top: 8px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  font-style: italic;
}
@keyframes badgePulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04); }
}

/* ---- Type hero / illustration ---- */
.type-hero {
  display: flex;
  justify-content: center;
}
.type-illustration {
  max-width: 100%;
  width: auto;
  height: auto;
  max-height: 320px;
  object-fit: contain;
  border-radius: var(--radius);
  filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.08));
  transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
}
.type-illustration:hover {
  transform: scale(1.02);
}
.type-illustration-placeholder {
  width: 100%;
  max-width: 480px;
  height: 240px;
  border-radius: var(--radius);
  background: hsl(var(--muted));
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(var(--muted-foreground));
  font-size: 120px;
  font-weight: 700;
}

/* ---- Quote mark ---- */
.quote-mark {
  margin-right: 2px;
}

/* ---- Dimension row ---- */
.dim-row {
  animation: dimIn 400ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: calc(var(--i, 0) * 80ms + 150ms);
}
@keyframes dimIn {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* ---- Relation badges ---- */
.relation-badge {
  border-radius: calc(var(--radius) * 0.3);
}
.rel-badge-accent {
  background-color: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}
.rel-badge-destructive {
  background-color: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground));
}
.rel-badge-secondary {
  background-color: hsl(var(--secondary));
  color: hsl(var(--secondary-foreground));
}
.rel-badge-muted {
  background-color: hsl(var(--muted));
  color: hsl(var(--foreground));
}
.relation-divider {
  border: 0;
  border-top: 1px solid hsl(var(--border));
}

/* ---- Mystery card (quick mode relations) ---- */
.mystery-card {
  padding: 16px;
  border-radius: calc(var(--radius) * 0.5);
  border: 1.5px dashed hsl(var(--border));
  background: hsl(var(--muted) / 0.3);
  text-align: left;
}
.mystery-badge {
  background-color: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  border-radius: calc(var(--radius) * 0.3);
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}

/* ---- Cross section ---- */
.cross-section {
  margin: 0;
}

/* ---- Upgrade prompt (quick mode) ---- */
.upgrade-prompt {
  background: hsl(var(--primary));
  border-radius: var(--radius);
  padding: 24px;
  text-align: center;
  color: hsl(var(--primary-foreground));
  position: relative;
  overflow: hidden;
}
.upgrade-prompt::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -20%;
  width: 200px;
  height: 200px;
  background: hsl(var(--primary-foreground) / 0.05);
  border-radius: 50%;
  pointer-events: none;
}
.prompt-icon {
  font-size: 24px;
  margin-bottom: 8px;
  opacity: 0.8;
}
.upgrade-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 16px;
  position: relative;
  z-index: 1;
}
.compare-table {
  background: hsl(var(--primary-foreground) / 0.1);
  border-radius: calc(var(--radius) * 0.75);
  overflow: hidden;
  margin-bottom: 20px;
  position: relative;
  z-index: 1;
}
.compare-header {
  display: grid;
  grid-template-columns: 1fr 1fr 1.4fr;
  gap: 8px;
  padding: 12px 16px;
  background: hsl(var(--primary-foreground) / 0.1);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.compare-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1.4fr;
  gap: 8px;
  padding: 12px 16px;
  font-size: 13px;
  border-top: 1px solid hsl(var(--primary-foreground) / 0.08);
}
.compare-col {
  text-align: left;
}
.compare-col.compare-highlight {
  font-weight: 600;
  color: hsl(var(--accent));
}
.upgrade-btn {
  padding: 12px 24px;
  background: hsl(var(--primary-foreground));
  color: hsl(var(--primary));
  border: none;
  border-radius: calc(var(--radius) * 0.5);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 150ms ease;
  position: relative;
  z-index: 1;
}
.upgrade-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}
.upgrade-btn:active {
  transform: translateY(0);
}
.upgrade-free {
  font-size: 12px;
  opacity: 0.6;
  margin-top: 12px;
  margin-bottom: 0;
  position: relative;
  z-index: 1;
}

/* ---- Login prompt modal ---- */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(19, 19, 31, 0.5); backdrop-filter: blur(8px);
  display: flex; justify-content: center; align-items: center; z-index: 100;
  padding: var(--space-5); animation: fadeIn 200ms ease;
}
.modal {
  background: var(--color-bg-elevated); border-radius: 24px; max-width: 360px; width: 100%;
  box-shadow: 0 24px 80px rgba(19, 19, 31, 0.2); animation: modalIn 300ms var(--ease-out-expo); overflow: hidden;
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center; padding: var(--space-5) var(--space-6) var(--space-3);
}
.modal-header h3 { font-family: var(--font-display); font-size: 20px; font-weight: 700; color: var(--gray-900); margin: 0; }
.close-btn {
  background: none; border: none; font-size: 24px; color: var(--gray-400); cursor: pointer;
  padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  border-radius: 8px; transition: background 150ms ease;
}
.close-btn:hover { background: var(--gray-100); }
.modal-body { padding: var(--space-4) var(--space-6) var(--space-6); text-align: center; }
.modal-body p { font-size: 14px; color: var(--gray-600); margin: 0 0 var(--space-3); line-height: 1.7; }
.modal-actions { display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-4); }
.modal-btn {
  width: 100%; padding: 12px; border-radius: 12px; font-size: 15px; font-weight: 600;
  border: none; cursor: pointer; transition: transform 100ms ease, opacity 150ms ease;
}
.modal-btn:active { transform: scale(0.97); }
.btn-primary { background: var(--color-primary); color: var(--color-text-inverse); }
.btn-primary:hover { opacity: 0.9; }
.btn-ghost { background: var(--gray-100); color: var(--gray-700); border: 1px solid var(--gray-300); }
.btn-ghost:hover { background: var(--gray-200); }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes modalIn { from { opacity: 0; transform: scale(0.92) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }

/* ---- Responsive ---- */
@media (max-width: 480px) {
  .type-illustration {
    max-height: 240px;
  }
  .type-illustration-placeholder {
    height: 200px;
    font-size: 80px;
  }
  .nfti-sticker {
    top: -10px;
    right: 8px;
    padding: 4px 8px;
  }
  .sticker-letter {
    font-size: 14px;
    width: 18px;
    height: 22px;
  }
}
</style>
