<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { hollandQuestions, HOLLAND_TOTAL } from '@/assessments/holland/questions'
import { calculateHolland } from '@/assessments/holland/scorer'
import { getStoredSession, getGuestSession } from '@/services/channelAuth'
import { dbSaveResult, dbIncrementCounter } from '@/services/channelDb'

const router = useRouter()
const route = useRoute()

const STORAGE_KEY = 'holland_progress'
const isDebug = computed(() => route.query.debug === '1')
const PER_PAGE = 4

// 动画状态
const displayPage = ref(1)
const slideDirection = ref<'next' | 'prev'>('next')
const isTransitioning = ref(false)
const errorQuestions = ref<Set<number>>(new Set())

// 全部 48 题，每页 4 题（12 页）
const allQuestions = computed(() => hollandQuestions)

const totalPages = computed(() => Math.ceil(allQuestions.value.length / PER_PAGE))

const currentPage = ref(1)
const answers = ref<Record<number, number>>({})
const isComplete = ref(false)
const loading = ref(true)
let debugTimer: ReturnType<typeof setTimeout> | null = null

// 当前页题目
const currentItems = computed(() => {
  const start = (currentPage.value - 1) * PER_PAGE
  return allQuestions.value.slice(start, start + PER_PAGE)
})

function getQ(idx: number) { return hollandQuestions[idx]! }

const progress = computed(() => Math.round((Object.keys(answers.value).length / HOLLAND_TOTAL) * 100))
const canGoNext = computed(() => currentItems.value.every((item, i) => {
  const idx = (currentPage.value - 1) * PER_PAGE + i
  return answers.value[getQ(idx).id] !== undefined
}))
const canGoPrev = computed(() => currentPage.value > 1)
const isLastPage = computed(() => currentPage.value >= totalPages.value)

const LIKERT_LABELS = ['完全不像我', '不太像我', '有点像我', '比较像我', '非常像我']

// lifecycle
onMounted(() => {
  loadProgress()
  loading.value = false
  if (isDebug.value) runDebugAutoAnswer()
})

onUnmounted(() => { if (debugTimer) clearTimeout(debugTimer) })

function loadProgress() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const data = JSON.parse(saved)
      if (data.answers && data.page) {
        answers.value = data.answers
        currentPage.value = data.page
        displayPage.value = data.page
      }
    }
  } catch {}
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers: answers.value, page: currentPage.value, timestamp: Date.now() }))
  } catch {}
}

function pickAnswer(questionId: number, value: number) {
  answers.value = { ...answers.value, [questionId]: value }
  saveProgress()
}

function goNext() {
  if (isTransitioning.value) return

  // 检查当前页是否有未完成的题目
  const startIdx = (currentPage.value - 1) * PER_PAGE
  const unanswered = currentItems.value.filter((_item, i) => {
    return answers.value[getQ(startIdx + i).id] === undefined
  })
  if (unanswered.length > 0) {
    const firstUnansweredIdx = startIdx + currentItems.value.findIndex((_item, i) => answers.value[getQ(startIdx + i).id] === undefined)
    const firstId = getQ(firstUnansweredIdx).id
    errorQuestions.value.add(firstId)
    errorQuestions.value = new Set(errorQuestions.value)

    nextTick().then(() => {
      const el = document.getElementById('hq-' + firstId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })

    setTimeout(() => {
      errorQuestions.value.delete(firstId)
      errorQuestions.value = new Set(errorQuestions.value)
    }, 1200)
    return
  }

  if (isLastPage.value) {
    finishTest()
    return
  }

  slideDirection.value = 'next'
  isTransitioning.value = true
  currentPage.value++
  displayPage.value = currentPage.value
  saveProgress()
  window.scrollTo({ top: 0, behavior: 'smooth' })

  setTimeout(() => { isTransitioning.value = false }, 350)
}

function goPrev() {
  if (isTransitioning.value) return
  if (currentPage.value > 1) {
    slideDirection.value = 'prev'
    isTransitioning.value = true
    currentPage.value--
    displayPage.value = currentPage.value
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setTimeout(() => { isTransitioning.value = false }, 350)
  }
}

async function finishTest() {
  isComplete.value = true
  const result = calculateHolland(answers.value)

  // debug 模式（?debug=1）或非认真作答（全题同值）：结果不落库、不计数
  // （非认真作答会污染图鉴收集数与全站百分位）
  if (!isDebug.value && !result.isNonSerious) {
    let userTinyId: string | null = null
    let guestId: string | null = null
    const stored = getStoredSession()
    if (stored?.user?.tinyId) {
      userTinyId = stored.user.tinyId
    } else {
      const guest = getGuestSession()
      if (guest) guestId = guest.guestId
    }

    dbSaveResult({
      assessment_type: 'holland',
      user_id: null, tiny_id: userTinyId, guest_id: guestId,
      mode: 'full',
      type_code: result.code,
      type_name: result.careers[0]?.title || result.code,
      scores: result.scores,
      answers: Object.values(answers.value),
    }).catch((err) => console.warn('保存霍兰德结果失败:', err))

    dbIncrementCounter().catch((err) => console.warn('计数器增加失败:', err))
  }

  localStorage.removeItem(STORAGE_KEY)
  sessionStorage.setItem('holland_result', JSON.stringify(result))
  router.push('/holland-result')
}

// Debug
function runDebugAutoAnswer() {
  const autoAnswer = () => {
    if (!isDebug.value) return
    for (const item of currentItems.value) {
      if (answers.value[item.id] === undefined) {
        answers.value = {
          ...answers.value,
          [item.id]: Math.floor(Math.random() * 5) + 1
        }
      }
    }
    debugTimer = setTimeout(() => {
      if (isLastPage.value) { finishTest() }
      else { currentPage.value++; debugTimer = setTimeout(autoAnswer, 300) }
    }, 300)
  }
  debugTimer = setTimeout(autoAnswer, 300)
}

function handleSkip() {
  if (confirm('确定退出吗？进度已保存，下次继续。')) router.push('/')
}
</script>

<template>
  <main class="min-h-screen font-sans antialiased" style="font-family: var(--font-sans);">
    <div class="relative mx-auto w-full max-w-[640px] min-h-screen" style="background-color: hsl(var(--background));">
      <!-- 顶部导航 -->
      <header class="sticky top-0 z-20"
        style="background-color: hsl(var(--background) / 0.88); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); border-bottom: 1px solid hsl(var(--border));">
        <div class="flex items-center justify-between px-5 py-3.5">
          <button class="text-[19px] font-bold transition-opacity hover:opacity-70" style="color: hsl(var(--primary)); letter-spacing: 0.01em;" @click="handleSkip">NFTI</button>
          <div class="flex items-center gap-2.5">
            <span class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium"
              :class="{ 'debug-tag': isDebug }"
              :style="!isDebug ? { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))' } : {}">霍兰德</span>
            <span class="text-[12px] tabular-nums" style="color: hsl(var(--muted-foreground));">{{ displayPage }} / {{ totalPages }}</span>
          </div>
        </div>
        <div class="px-5 pb-3">
          <div class="w-full overflow-hidden rounded-full" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100"
            style="height:3px; background-color: hsl(var(--muted));">
            <div class="h-full rounded-full transition-[width] duration-400 ease-out" :style="{ width: progress + '%', backgroundColor: 'hsl(var(--primary))' }"></div>
          </div>
        </div>
      </header>

      <!-- 题目区域 -->
      <section class="flex flex-col gap-4 px-4 pt-4 pb-36 sm:px-5">
        <div v-if="loading" class="loading-box">
          <div class="spinner" style="border-color: hsl(var(--muted)); border-top-color: hsl(var(--primary));"></div>
          <span style="color: hsl(var(--muted-foreground)); font-size: 13px;">加载中...</span>
        </div>

        <Transition v-if="!loading"
          :name="slideDirection === 'next' ? 'slide-next' : 'slide-prev'"
          mode="out-in"
        >
          <div :key="displayPage" class="question-slide flex flex-col gap-4">
            <template v-for="(item, idx) in currentItems" :key="item.id">
              <!-- 统一 Likert 量表 -->
              <div
                :id="'hq-' + item.id"
                class="q-card"
                :class="{ 'question-error': errorQuestions.has(item.id) }"
              >
                <div class="q-header">
                  <span class="q-num">Q{{ item.id }}</span>
                </div>
                <p class="q-scene">{{ item.text }}</p>
                <div class="likert-row">
                  <button
                    v-for="(label, i) in LIKERT_LABELS"
                    :key="i"
                    class="likert-btn"
                    :class="{ active: answers[item.id] === i + 1 }"
                    @click="pickAnswer(item.id, i + 1)"
                  >{{ label }}</button>
                </div>
              </div>
            </template>
          </div>
        </Transition>
      </section>

      <!-- 底部导航 -->
      <nav class="fixed bottom-0 left-1/2 z-30 w-full max-w-[640px] -translate-x-1/2"
        style="background-color: hsl(var(--background) / 0.82); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); border-top: 1px solid hsl(var(--border));">
        <div class="flex items-center justify-between gap-3 px-4 py-3" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
          <button
            class="group inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            :disabled="!canGoPrev"
            style="background-color: hsl(var(--muted)); color: hsl(var(--muted-foreground)); border-radius: calc(var(--radius) * 0.5); --tw-ring-color: hsl(var(--ring));"
            @click="goPrev"
          >
            <svg class="w-4 h-4 transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
            <span>上一页</span>
          </button>

          <div class="flex items-center gap-1.5" role="presentation" :aria-label="'第 ' + displayPage + ' 页，共 ' + totalPages + ' 页'">
            <span
              v-for="p in totalPages"
              :key="p"
              class="dot rounded-full transition-all duration-200"
              :class="{ 'dot-active': p === displayPage, 'dot-completed': p < displayPage, 'dot-default': p > displayPage }"
            ></span>
          </div>

          <button
            class="group inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2"
            :style="{ backgroundColor: canGoNext ? 'hsl(var(--primary))' : 'hsl(var(--muted))', color: canGoNext ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))', borderRadius: 'calc(var(--radius) * 0.5)', '--tw-ring-color': 'hsl(var(--primary-foreground))' }"
            @click="goNext"
          >
            <span>{{ isLastPage ? '查看结果' : '下一页' }}</span>
            <svg v-if="!isLastPage" class="w-4 h-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
        </div>
      </nav>
    </div>
  </main>
</template>

<style scoped>
/* ---- Debug tag ---- */
.debug-tag {
  background-color: hsl(var(--destructive)) !important;
  color: hsl(var(--destructive-foreground)) !important;
}

/* ---- Loading ---- */
.loading-box { display:flex; align-items:center; justify-content:center; gap:10px; padding:80px 20px; }
.spinner { width:24px; height:24px; border:3px solid; border-radius:50%; animation:spin .8s linear infinite; }
@keyframes spin { to{transform:rotate(360deg)} }

/* ---- Question cards ---- */
.q-card {
  background-color: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  padding: var(--space-5);
}
.q-header { display:flex; align-items:center; gap:var(--space-2); margin-bottom:var(--space-3); }
.q-num { font-size:12px; font-weight:600; color:hsl(var(--muted-foreground)); }
.q-type { font-size:10px; padding:1px 6px; background:hsl(var(--primary) / 0.1); color:hsl(var(--primary)); border-radius:4px; font-weight:600; }
.q-scene { font-size:15px; line-height:1.6; color:hsl(var(--foreground)); margin-bottom:var(--space-4); font-weight:500; }

/* ---- Likert 5-level ---- */
.likert-row { display:flex; gap:6px; }
.likert-btn { flex:1; padding:8px 4px; font-size:11px; font-weight:500; border:1px solid hsl(var(--border)); border-radius:calc(var(--radius) * 0.5); background-color:hsl(var(--card)); color:hsl(var(--muted-foreground)); cursor:pointer; transition:all 150ms; text-align:center; line-height:1.3; }
.likert-btn:hover { border-color:hsl(var(--primary)); color:hsl(var(--primary)); background-color:hsl(var(--primary) / 0.05); }
.likert-btn.active { border-color:hsl(var(--primary)); background-color:hsl(var(--primary)); color:hsl(var(--primary-foreground)); }

/* ---- Page dots ---- */
.dot {
  width: 6px;
  height: 6px;
  background-color: hsl(var(--border));
}
.dot-default {
  background-color: hsl(var(--border));
}
.dot-completed {
  background-color: hsl(var(--accent));
}
.dot-active {
  width: 22px;
  background-color: hsl(var(--primary));
}

/* ---- Slide Transitions ---- */
.slide-next-enter-active {
  transition: all 350ms cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-next-leave-active {
  transition: all 250ms ease-in;
  position: absolute;
  width: calc(100% - 2rem);
}
.slide-next-enter-from {
  opacity: 0;
  transform: translateX(40px);
}
.slide-next-leave-to {
  opacity: 0;
  transform: translateX(-40px);
}

.slide-prev-enter-active {
  transition: all 350ms cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-prev-leave-active {
  transition: all 250ms ease-in;
  position: absolute;
  width: calc(100% - 2rem);
}
.slide-prev-enter-from {
  opacity: 0;
  transform: translateX(-40px);
}
.slide-prev-leave-to {
  opacity: 0;
  transform: translateX(40px);
}

/* ---- Error flash animation ---- */
@keyframes error-flash {
  0%   { border-color: #ef4444 !important; box-shadow: 0 0 0 3px rgba(239,68,68,0.25); }
  16%  { border-color: hsl(var(--border)) !important; box-shadow: none; }
  33%  { border-color: #ef4444 !important; box-shadow: 0 0 0 3px rgba(239,68,68,0.25); }
  49%  { border-color: hsl(var(--border)) !important; box-shadow: none; }
  66%  { border-color: #ef4444 !important; box-shadow: 0 0 0 3px rgba(239,68,68,0.25); }
  82%  { border-color: hsl(var(--border)) !important; box-shadow: none; }
  100% { border-color: hsl(var(--border)) !important; box-shadow: none; }
}
.question-error {
  animation: error-flash 1.2s ease-in-out;
}

/* ---- Responsive ---- */
@media (max-width:480px) {
  .likert-row { flex-wrap:wrap; }
  .likert-btn { flex:1 0 30%; font-size:10px; padding:6px 2px; }
}
</style>
