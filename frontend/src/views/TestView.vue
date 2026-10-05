<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useTestStore } from '@/stores/testStore'
import { computed, watch, ref, nextTick, onMounted, onUnmounted } from 'vue'

const route = useRoute()
const router = useRouter()
const store = useTestStore()

const mode = computed(() => route.params.mode as string)
const routePage = computed(() => parseInt(route.params.page as string) || 1)
const isDebug = computed(() => mode.value === 'debug')

// 内部页面状态，用于平滑切换动画
const displayPage = ref(1)
const slideDirection = ref<'next' | 'prev'>('next')
const isTransitioning = ref(false)
const errorQuestions = ref<Set<number>>(new Set())

// Debug 自动答题定时器
let debugTimer: ReturnType<typeof setTimeout> | null = null

// 初始化：从路由参数同步到 store
watch([mode, routePage], ([newMode, newPage]) => {
  if (newMode && ['quick', 'full', 'debug'].includes(newMode)) {
    store.setMode(newMode as 'quick' | 'full' | 'debug')
    store.currentPage = newPage
    displayPage.value = newPage
  }
}, { immediate: true })

// Debug 模式：自动答题
const isAutoAnswer = ref(false)

function handleExit() {
  if (confirm('确定退出吗？进度已保存，下次继续。')) router.push('/')
}

function runDebugAutoAnswer() {
  if (!isDebug.value && !isAutoAnswer.value) return
  const questions = store.currentQuestions
  if (!questions.length) return

  // 为当前页每道题随机选择答案
  for (const q of questions) {
    if (store.answers[q.id] !== undefined) continue
    let value: number
    if (isHiddenQuestion(q.id)) {
      // 隐藏题：1-4 随机
      value = Math.floor(Math.random() * 4) + 1
    } else {
      // 标准题：-3 到 +3 随机（排除0）
      const values = [-3, -2, -1, 1, 2, 3]
      value = values[Math.floor(Math.random() * values.length)]!
    }
    store.setAnswer(q.id, value)
  }

  // 延迟后自动下一页
  debugTimer = setTimeout(() => {
    if (store.isLastPage && store.canGoNext) {
      store.calculateResult()
      if (store.result) {
        router.push('/result/' + mode.value)
      }
    } else if (store.canGoNext) {
      goNext()
      // 继续下一页的自动答题
      nextTick(() => {
        runDebugAutoAnswer()
      })
    }
  }, 300)
}

onMounted(() => {
  // 检查是否需要自动答题：debug模式 或 URL中有 ?auto=1
  const hasAuto = route.query.auto != null || window.location.search.includes('auto=1')
  // 每次进入测试页都显式重置：auto=1 时跳过持久化，正常测试则恢复持久化
  // （防止上一次 auto/debug 测试留下的 skipPersist=true 吞掉真实测试结果）
  store.skipPersist = hasAuto
  if (hasAuto) {
    isAutoAnswer.value = true
  }
  if (isDebug.value || hasAuto) {
    debugTimer = setTimeout(() => {
      runDebugAutoAnswer()
    }, 500)
  }
})

onUnmounted(() => {
  if (debugTimer) {
    clearTimeout(debugTimer)
    debugTimer = null
  }
})

function selectOption(questionId: number, value: number) {
  store.setAnswer(questionId, value)
}

function isSelected(questionId: number, value: number): boolean {
  return store.answers[questionId] === value
}

async function goNext() {
  if (isTransitioning.value) return

  // 检查当前页是否有未完成的题目
  const unanswered = store.currentQuestions.filter(q => store.answers[q.id] === undefined)
  const firstUnanswered = unanswered[0]
  if (firstUnanswered) {
    const firstId = firstUnanswered.id
    errorQuestions.value.add(firstId)
    errorQuestions.value = new Set(errorQuestions.value)

    await nextTick()
    const el = document.getElementById('question-' + firstId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    setTimeout(() => {
      errorQuestions.value.delete(firstId)
      errorQuestions.value = new Set(errorQuestions.value)
    }, 1200)
    return
  }

  if (store.isLastPage) {
    store.calculateResult()
    if (store.result) {
      router.push(`/result/${mode.value}`)
    }
    return
  }

  slideDirection.value = 'next'
  isTransitioning.value = true
  store.currentPage++
  displayPage.value = store.currentPage
  store.saveProgress()

  window.scrollTo({ top: 0, behavior: 'smooth' })

  await nextTick()
  setTimeout(() => {
    isTransitioning.value = false
  }, 350)
}

async function goPrev() {
  if (!store.canGoPrev || isTransitioning.value) return

  slideDirection.value = 'prev'
  isTransitioning.value = true
  store.currentPage--
  displayPage.value = store.currentPage
  store.saveProgress()

  window.scrollTo({ top: 0, behavior: 'smooth' })

  await nextTick()
  setTimeout(() => {
    isTransitioning.value = false
  }, 350)
}

const optionLabels = [
  { value: -3, label: '强烈反对', short: '-3', dotSize: 14 },
  { value: -2, label: '反对', short: '-2', dotSize: 11 },
  { value: -1, label: '有点反对', short: '-1', dotSize: 8 },
  { value: 1, label: '有点赞同', short: '+1', dotSize: 8 },
  { value: 2, label: '赞同', short: '+2', dotSize: 11 },
  { value: 3, label: '强烈赞同', short: '+3', dotSize: 14 },
]

// 隐藏题四选项（id >= 149）
const hiddenOptions = [
  { value: 1, label: 'A. 抹茶味', short: 'A' },
  { value: 2, label: 'B. 草莓味', short: 'B' },
  { value: 3, label: 'C. 巧克力味', short: 'C' },
  { value: 4, label: 'D. 石油味', short: 'D' },
]

function isHiddenQuestion(qid: number): boolean {
  return qid >= 149
}

function modeLabel() {
  if (isDebug.value || isAutoAnswer.value) return 'DEBUG'
  return mode.value === 'quick' ? '快速' : '完整'
}
</script>

<template>
  <main class="min-h-screen font-sans antialiased" style="font-family: var(--font-sans);">
    <div class="relative mx-auto w-full max-w-[640px] min-h-screen" style="background-color: hsl(var(--background));">
      <!-- 顶部导航 -->
      <header class="sticky top-0 z-20"
        style="background-color: hsl(var(--background) / 0.88); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); border-bottom: 1px solid hsl(var(--border));">
        <div class="flex items-center justify-between px-5 py-3.5">
          <button class="text-[19px] font-bold transition-opacity hover:opacity-70" style="color: hsl(var(--primary)); letter-spacing: 0.01em;" @click="handleExit">NFTI</button>
          <div class="flex items-center gap-2.5">
            <span class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium"
              :class="{ 'debug-tag': isDebug || isAutoAnswer }"
              :style="!isDebug && !isAutoAnswer ? { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))' } : {}">{{ modeLabel() }}</span>
            <span class="text-[12px] tabular-nums" style="color: hsl(var(--muted-foreground));">{{ displayPage }} / {{ store.totalPages }}</span>
          </div>
        </div>
        <div class="px-5 pb-3">
          <div class="w-full overflow-hidden rounded-full" role="progressbar" :aria-valuenow="store.progress" aria-valuemin="0" aria-valuemax="100"
            style="height:3px; background-color: hsl(var(--muted));">
            <div class="h-full rounded-full transition-[width] duration-400 ease-out" :style="{ width: store.progress + '%', backgroundColor: 'hsl(var(--primary))' }"></div>
          </div>
        </div>
      </header>

      <!-- 题目区域 -->
      <section class="flex flex-col gap-4 px-4 pt-4 pb-36 sm:px-5">
        <Transition
          :name="slideDirection === 'next' ? 'slide-next' : 'slide-prev'"
          mode="out-in"
        >
          <div :key="displayPage" class="question-slide flex flex-col gap-4">
            <article
              v-for="(q, index) in store.currentQuestions"
              :key="q.id"
              :id="'question-' + q.id"
              class="flex flex-col gap-4 p-4 sm:p-5"
              :class="{ 'question-error': errorQuestions.has(q.id) }"
              style="background-color: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius);"
            >
              <div class="flex flex-col gap-2">
                <span class="text-[12px] font-bold" style="color: hsl(var(--primary)); letter-spacing: 0.06em;">Q{{ (store.currentPage - 1) * 4 + index + 1 }}</span>
                <p class="text-[18px]" style="color: hsl(var(--foreground)); line-height: 1.7;">{{ q.text }}</p>
              </div>

              <!-- 标准题：Likert 6级量表 -->
              <template v-if="!isHiddenQuestion(q.id)">
                <div class="flex flex-col gap-2.5">
                  <div class="flex items-center justify-between text-[11px]" style="color: hsl(var(--muted-foreground));">
                    <span>不同意</span>
                    <span>同意</span>
                  </div>
                  <div class="flex gap-1" role="group" :aria-label="`Q${q.id} 评分`">
                    <button
                      v-for="opt in optionLabels"
                      :key="opt.value"
                      type="button"
                      :aria-pressed="isSelected(q.id, opt.value)"
                      class="opt-btn flex flex-1 flex-col items-center gap-1.5 cursor-pointer border px-0.5 py-2.5 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2"
                      :class="{
                        'opt-selected-positive': opt.value > 0 && isSelected(q.id, opt.value),
                        'opt-selected-negative': opt.value < 0 && isSelected(q.id, opt.value),
                      }"
                      :style="!isSelected(q.id, opt.value) ? {
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        '--tw-ring-color': 'hsl(var(--ring))'
                      } : {}"
                      @click="selectOption(q.id, opt.value)"
                    >
                      <span
                        class="rounded-full"
                        :style="isSelected(q.id, opt.value)
                          ? { width: opt.dotSize + 'px', height: opt.dotSize + 'px', backgroundColor: 'hsl(var(--primary-foreground))' }
                          : { width: opt.dotSize + 'px', height: opt.dotSize + 'px', border: '1.5px solid hsl(var(--muted-foreground))' }
                        "
                      ></span>
                      <span class="text-[11px] font-bold tabular-nums" :style="isSelected(q.id, opt.value) ? { color: 'hsl(var(--primary-foreground))' } : { color: 'hsl(var(--foreground))' }">{{ opt.short }}</span>
                      <span class="text-[9px] leading-tight whitespace-nowrap" :style="isSelected(q.id, opt.value) ? { color: 'hsl(var(--primary-foreground))' } : { color: 'hsl(var(--muted-foreground))' }">{{ opt.label }}</span>
                    </button>
                  </div>
                </div>
              </template>

              <!-- 隐藏题：四选项单选 -->
              <template v-else>
                <div class="flex flex-col gap-2.5">
                  <div class="flex items-center justify-between text-[11px]" style="color: hsl(var(--muted-foreground));">
                    <span>选一个最像你的</span>
                    <span>单选</span>
                  </div>
                  <div class="flex flex-col gap-2">
                    <button
                      v-for="opt in hiddenOptions"
                      :key="opt.value"
                      type="button"
                      :aria-pressed="isSelected(q.id, opt.value)"
                      class="hidden-opt-btn flex items-center gap-3 cursor-pointer border px-4 py-3 transition-all duration-150 hover:translate-x-1 active:translate-x-0.5 motion-reduce:transition-none motion-reduce:hover:translate-x-0 focus-visible:outline-none focus-visible:ring-2"
                      :class="{ 'hidden-opt-selected': isSelected(q.id, opt.value) }"
                      :style="!isSelected(q.id, opt.value) ? {
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        '--tw-ring-color': 'hsl(var(--ring))'
                      } : {}"
                      @click="selectOption(q.id, opt.value)"
                    >
                      <span class="hidden-opt-letter flex items-center justify-center font-bold flex-none"
                        :style="isSelected(q.id, opt.value)
                          ? { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }
                          : { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }"
                      >{{ opt.short }}</span>
                      <span class="text-[14px] flex-1 text-left whitespace-nowrap" :style="isSelected(q.id, opt.value) ? { color: 'hsl(var(--foreground))', fontWeight: 600 } : { color: 'hsl(var(--foreground))' }">{{ opt.label }}</span>
                    </button>
                  </div>
                </div>
              </template>
            </article>
          </div>
        </Transition>
      </section>

      <!-- 底部导航 -->
      <nav class="fixed bottom-0 left-1/2 z-30 w-full max-w-[640px] -translate-x-1/2"
        style="background-color: hsl(var(--background) / 0.82); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); border-top: 1px solid hsl(var(--border));">
        <div class="flex items-center justify-between gap-3 px-4 py-3" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
          <button
            class="group inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            :disabled="!store.canGoPrev"
            style="background-color: hsl(var(--muted)); color: hsl(var(--muted-foreground)); border-radius: calc(var(--radius) * 0.5); --tw-ring-color: hsl(var(--ring));"
            @click="goPrev"
          >
            <svg class="w-4 h-4 transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
            <span>上一页</span>
          </button>

          <div class="flex items-center gap-1.5" role="presentation" :aria-label="`第 ${displayPage} 页，共 ${store.totalPages} 页`">
            <span
              v-for="p in store.totalPages"
              :key="p"
              class="dot rounded-full transition-all duration-200"
              :class="{ 'dot-active': p === displayPage, 'dot-completed': p < displayPage, 'dot-default': p > displayPage }"
            ></span>
          </div>

          <button
            class="group inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            :style="{ backgroundColor: store.canGoNext ? 'hsl(var(--primary))' : 'hsl(var(--muted))', color: store.canGoNext ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))', borderRadius: 'calc(var(--radius) * 0.5)', '--tw-ring-color': 'hsl(var(--primary-foreground))' }"
            @click="goNext"
          >
            <span>{{ store.isLastPage ? '查看结果' : '下一页' }}</span>
            <svg v-if="!store.isLastPage" class="w-4 h-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
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

/* ---- Selected option states ---- */
.opt-selected-positive {
  background-color: hsl(var(--primary)) !important;
  border-color: hsl(var(--primary)) !important;
  --tw-ring-color: hsl(var(--primary-foreground)) !important;
  transform: translateY(-2px);
}
.opt-selected-negative {
  background-color: hsl(var(--destructive)) !important;
  border-color: hsl(var(--destructive)) !important;
  --tw-ring-color: hsl(var(--destructive-foreground)) !important;
  transform: translateY(-2px);
}

.opt-btn {
  border-radius: calc(var(--radius) * 0.5);
}

/* ---- Hidden option selected ---- */
.hidden-opt-selected {
  background-color: hsl(var(--primary)) !important;
  border-color: hsl(var(--primary)) !important;
  transform: translateX(4px);
  --tw-ring-color: hsl(var(--primary-foreground)) !important;
}
.hidden-opt-btn {
  border-radius: calc(var(--radius) * 0.5);
}

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

/* ---- Responsive ---- */
@media (max-width: 480px) {
  .question-slide {
    gap: 12px;
  }
}
</style>
