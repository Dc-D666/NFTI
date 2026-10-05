<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { hollandRoles } from '@/assessments/holland/roles'
import { allCareers } from '@/assessments/holland/careers'
import type { HollandDimension, CareerRecommendation } from '@/types/holland'
import { getJobIllustration } from '@/utils/illustrations'

const router = useRouter()

// 嵌入模式（图鉴主页 Tab 内）：隐藏返回顶栏，由外层提供导航
// 收集模式：collectedCareers 为已收集职业 title 集合，未收集显示锁定剪影
const props = withDefaults(defineProps<{
  embedded?: boolean
  collected?: Set<string>
}>(), { embedded: false, collected: () => new Set<string>() })

// 六维角色（固定顺序 R I A S E C）
const roles = computed(() => {
  const order: HollandDimension[] = ['R', 'I', 'A', 'S', 'E', 'C']
  return order.map(d => hollandRoles[d])
})

const DIM_NAMES: Record<HollandDimension, string> = {
  R: '现实型', I: '研究型', A: '艺术型', S: '社会型', E: '企业型', C: '常规型',
}
const DIM_COLORS: Record<HollandDimension, string> = {
  R: '#6E5F48', I: '#4D4031', A: '#BBA888', S: '#D8CFBE', E: '#9C8B6A', C: '#524739',
}

// 职业按 category 分组
const categories = computed(() => {
  const map = new Map<string, CareerRecommendation[]>()
  for (const c of allCareers) {
    if (!map.has(c.category)) map.set(c.category, [])
    map.get(c.category)!.push(c)
  }
  return Array.from(map.entries())
})

const totalCareers = allCareers.length

// 是否已收集
function isCollected(c: CareerRecommendation): boolean {
  return props.collected.has(c.title)
}

// 详情弹窗（仅已收集可打开）
const selected = ref<CareerRecommendation | null>(null)
function openDetail(c: CareerRecommendation) {
  if (!isCollected(c)) return
  selected.value = c
}
function closeDetail() { selected.value = null }

function dimBarWidth(w: number): string {
  return (w / 5) * 100 + '%'
}
</script>

<template>
  <main class="min-h-screen font-sans antialiased" style="font-family: var(--font-sans);">
    <div class="mx-auto w-full max-w-[560px] px-5 pb-10">

      <!-- Top bar -->
      <header v-if="!embedded" class="flex items-center justify-between py-5">
        <button class="gt-text-btn text-[12px] font-medium" @click="router.push('/')">← 返回首页</button>
        <span class="text-[11px] font-medium uppercase" style="color: hsl(var(--muted-foreground)); letter-spacing: 0.12em;">职业图鉴</span>
      </header>

      <!-- Hero -->
      <section class="pb-6">
        <h1 class="font-bold leading-[1.15]" style="font-size: clamp(30px, 8vw, 40px); color: hsl(var(--foreground));">💼 职业图鉴</h1>
        <p class="text-[14px] mt-2 leading-[1.7]" style="color: hsl(var(--muted-foreground));">完成职业测试即可收集推荐职业 · 未收集的仍是个谜<br>看看你能解锁多少种方向</p>
      </section>

      <!-- ═══ 六维角色（始终展示） ═══ -->
      <section class="pb-7">
        <h2 class="text-[15px] font-bold mb-3" style="color: hsl(var(--foreground)); letter-spacing: 0.02em;">六大兴趣类型</h2>
        <div class="flex flex-col gap-2.5">
          <div
            v-for="r in roles" :key="r.dimension"
            class="p-4"
            style="background-color: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-left: 4px solid; border-radius: 14px;"
            :style="{ 'border-left-color': DIM_COLORS[r.dimension] }"
          >
            <div class="flex items-center gap-2 mb-1.5">
              <span class="text-[22px]">{{ r.emoji }}</span>
              <span class="text-[15px] font-bold" style="color: hsl(var(--foreground));">{{ r.name }}</span>
              <span class="text-[12px] font-mono font-bold" :style="{ color: DIM_COLORS[r.dimension] }">{{ r.dimension }}</span>
            </div>
            <p class="text-[13px] leading-[1.7] mb-2" style="color: hsl(var(--muted-foreground));">{{ r.description }}</p>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="c in r.suitableClubs" :key="c" class="text-[11px] px-2 py-0.5 rounded-full" style="background: hsl(var(--primary) / 0.08); color: hsl(var(--primary));">{{ c }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ═══ 全部职业（按分类） ═══ -->
      <section v-for="[cat, careers] in categories" :key="cat" class="pb-7">
        <h2 class="text-[15px] font-bold mb-3" style="color: hsl(var(--foreground)); letter-spacing: 0.02em;">{{ cat }} <span class="text-[12px] font-normal" style="color: hsl(var(--muted-foreground));">{{ careers.length }} 个</span></h2>
        <div class="grid grid-cols-2 gap-3">
          <div
            v-for="c in careers" :key="c.title"
            class="overflow-hidden transition-all duration-150 cursor-pointer"
            :class="isCollected(c) ? 'hover:-translate-y-0.5' : 'opacity-90'"
            style="background-color: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius);"
            @click="openDetail(c)"
          >
            <!-- 已收集：插图 + 标题 -->
            <template v-if="isCollected(c)">
              <div class="aspect-[1.5] w-full overflow-hidden">
                <img
                  v-if="getJobIllustration(c.title)"
                  :src="getJobIllustration(c.title)"
                  :alt="c.title"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-[28px]" style="background: hsl(var(--muted));">{{ c.title[0] }}</div>
              </div>
              <div class="p-3">
                <div class="text-[14px] font-bold mb-0.5" style="color: hsl(var(--foreground));">{{ c.title }}</div>
                <div class="flex items-center gap-1.5">
                  <span class="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded" :style="{ background: DIM_COLORS[c.source] + '22', color: DIM_COLORS[c.source] }">{{ c.source }}</span>
                  <span class="text-[11px]" style="color: hsl(var(--muted-foreground));">{{ DIM_NAMES[c.source] }}</span>
                </div>
              </div>
            </template>
            <!-- 未收集：剪影 -->
            <template v-else>
              <div class="aspect-[1.5] w-full flex items-center justify-center text-[40px]" style="background: linear-gradient(135deg, hsl(var(--muted)), hsl(var(--card)));">
                <span class="opacity-50">🔒</span>
              </div>
              <div class="p-3">
                <div class="text-[14px] font-bold mb-0.5" style="color: hsl(var(--muted-foreground));">？？？</div>
                <p class="text-[11px]" style="color: hsl(var(--muted-foreground)); opacity: 0.6;">未解锁 · 职业测试后可收集</p>
              </div>
            </template>
          </div>
        </div>
      </section>

      <p class="text-[11px] text-center pt-4" style="color: hsl(var(--muted-foreground));">职业推荐仅供娱乐参考，请勿作为职业决策的唯一依据</p>

    </div>

    <!-- ═══ 详情弹窗（仅已收集） ═══ -->
    <transition name="fade">
      <div v-if="selected" class="modal-overlay" @click="closeDetail">
        <div class="modal gallery-detail" @click.stop>
          <div class="modal-header">
            <h3>{{ selected.title }}</h3>
            <button class="close-btn" @click="closeDetail">&times;</button>
          </div>
          <div class="modal-body" style="align-items: stretch;">
            <div class="aspect-[1.5] w-full overflow-hidden rounded-xl mb-3">
              <img
                v-if="getJobIllustration(selected.title)"
                :src="getJobIllustration(selected.title)"
                :alt="selected.title"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-[40px]" style="background: hsl(var(--muted));">{{ selected.title[0] }}</div>
            </div>
            <div class="flex items-center gap-1.5 mb-2.5">
              <span class="text-[12px] font-mono font-bold px-2 py-0.5 rounded" :style="{ background: DIM_COLORS[selected.source] + '22', color: DIM_COLORS[selected.source] }">{{ selected.source }} · {{ DIM_NAMES[selected.source] }}</span>
              <span class="text-[12px] px-2 py-0.5 rounded-full" style="background: hsl(var(--muted)); color: hsl(var(--muted-foreground));">{{ selected.category }}</span>
            </div>
            <p class="text-[13px] leading-[1.8] mb-3" style="color: hsl(var(--foreground));">{{ selected.reason }}</p>
            <div class="mb-1 text-[12px] font-semibold" style="color: hsl(var(--muted-foreground));">需求权重</div>
            <div class="flex flex-col gap-1.5">
              <div v-for="d in (['R','I','A','S','E','C'] as HollandDimension[])" :key="d" class="flex items-center gap-2">
                <span class="text-[11px] font-mono font-bold w-4" :style="{ color: DIM_COLORS[d] }">{{ d }}</span>
                <div class="flex-1 h-2 rounded-full" style="background: hsl(var(--muted));">
                  <div class="h-full rounded-full" :style="{ width: dimBarWidth(selected.weights[d]), background: DIM_COLORS[d] }"></div>
                </div>
                <span class="text-[11px] w-4 text-right" style="color: hsl(var(--muted-foreground));">{{ selected.weights[d] }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </main>
</template>

<style scoped>
.gt-text-btn { background: none; border: none; color: hsl(var(--muted-foreground)); cursor: pointer; transition: color 150ms ease; }
.gt-text-btn:hover { color: hsl(var(--foreground)); }
.close-btn { font-size: 22px; font-weight: 600; color: hsl(var(--muted-foreground)); background: none; border: none; cursor: pointer; line-height: 1; }
.close-btn:hover { color: hsl(var(--foreground)); }
</style>
