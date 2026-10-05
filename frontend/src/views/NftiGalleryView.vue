<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { fullTypes } from '@/data/personalities'
import type { PersonalityType } from '@/types'
import { getNftiIllustration, getNftiCode } from '@/utils/illustrations'

const router = useRouter()

// 嵌入模式（图鉴主页 Tab 内）：隐藏返回顶栏，由外层提供导航
// 收集模式：collectedNfti 为已收集人格 code 集合，未收集的条目显示锁定剪影
const props = withDefaults(defineProps<{
  embedded?: boolean
  collected?: Set<string>
}>(), { embedded: false, collected: () => new Set<string>() })

// 分组：标准 16 / 隐藏 3
const standard = fullTypes.filter(t => !t.isHidden)
const hidden = fullTypes.filter(t => t.isHidden)

const DIM_EMOJI: Record<string, string> = { E: '🌞', I: '🌙', S: '🏫', N: '💭', T: '🧠', F: '💗', J: '📋', P: '🎈' }

// 是否已收集
function isCollected(t: PersonalityType): boolean {
  return props.collected.has(t.code)
}

// 详情弹窗（仅已收集可打开）
const selected = ref<PersonalityType | null>(null)
function openDetail(t: PersonalityType) {
  if (!isCollected(t)) return
  selected.value = t
}
function closeDetail() { selected.value = null }

function fourLetterDisplay(t: PersonalityType): string {
  return t.fourLetter || ''
}

/** NFTI 四维度代码（从 illustration 路径提取，如 OVEF / OGLS），区别于 MBTI 的 fourLetter */
function nftiCodeDisplay(t: PersonalityType): string {
  return getNftiCode(t.illustration, t.code)
}

function emojiFor(t: PersonalityType): string {
  // 隐藏人格无插图 → 用 🔒；标准人格无插图时用维度 emoji 组合
  if (t.isHidden) return '🔒'
  const fl = fourLetterDisplay(t)
  if (fl) return fl.split('').map(c => DIM_EMOJI[c] || '❓').join('')
  return '📜'
}
</script>

<template>
  <main class="min-h-screen font-sans antialiased" style="font-family: var(--font-sans);">
    <div class="mx-auto w-full max-w-[560px] px-5 pb-10">

      <!-- Top bar -->
      <header v-if="!embedded" class="flex items-center justify-between py-5">
        <button class="gt-text-btn text-[12px] font-medium" @click="router.push('/')">← 返回首页</button>
        <span class="text-[11px] font-medium uppercase" style="color: hsl(var(--muted-foreground)); letter-spacing: 0.12em;">人格图鉴</span>
      </header>

      <!-- Hero -->
      <section class="pb-6">
        <h1 class="font-bold leading-[1.15]" style="font-size: clamp(30px, 8vw, 40px); color: hsl(var(--foreground));">🧭 人格图鉴</h1>
        <p class="text-[14px] mt-2 leading-[1.7]" style="color: hsl(var(--muted-foreground));">完成完整测试即可收集人格 · 未收集的仍是个谜<br>看看你解锁了哪几种南方人</p>
      </section>

      <!-- ═══ 标准人格 ═══ -->
      <section class="pb-7">
        <h2 class="text-[15px] font-bold mb-3" style="color: hsl(var(--foreground)); letter-spacing: 0.02em;">标准人格 <span class="text-[12px] font-normal" style="color: hsl(var(--muted-foreground));">完整测试 · 16 种</span></h2>
        <div class="grid grid-cols-2 gap-3">
          <div
            v-for="t in standard" :key="t.code"
            class="overflow-hidden transition-all duration-150 cursor-pointer"
            :class="isCollected(t) ? 'hover:-translate-y-0.5' : 'opacity-90'"
            style="background-color: hsl(var(--card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius);"
            @click="openDetail(t)"
          >
            <!-- 已收集：插图 + 代码 -->
            <template v-if="isCollected(t)">
              <div class="aspect-[1.5] w-full overflow-hidden">
                <img
                  v-if="getNftiIllustration(t.illustration)"
                  :src="getNftiIllustration(t.illustration)"
                  :alt="t.name"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-[32px]" style="background: hsl(var(--muted));">{{ emojiFor(t) }}</div>
              </div>
              <div class="p-3">
                <div v-if="nftiCodeDisplay(t)" class="text-[16px] font-mono font-bold tracking-widest mb-0.5" style="color: hsl(var(--foreground));">{{ nftiCodeDisplay(t) }}</div>
                <p class="text-[12px] leading-[1.6] line-clamp-2" style="color: hsl(var(--muted-foreground));">{{ t.description }}</p>
              </div>
            </template>
            <!-- 未收集：剪影 -->
            <template v-else>
              <div class="aspect-[1.5] w-full flex items-center justify-center text-[40px]" style="background: linear-gradient(135deg, hsl(var(--muted)), hsl(var(--card)));">
                <span class="opacity-50">🔒</span>
              </div>
              <div class="p-3">
                <div class="text-[15px] font-mono font-bold mb-0.5" style="color: hsl(var(--muted-foreground));">？？？</div>
                <p class="text-[12px]" style="color: hsl(var(--muted-foreground)); opacity: 0.6;">未解锁 · 完整测试后可收集</p>
              </div>
            </template>
          </div>
        </div>
      </section>

      <!-- ═══ 隐藏人格 ═══ -->
      <section class="pb-6">
        <h2 class="text-[15px] font-bold mb-3" style="color: hsl(var(--foreground)); letter-spacing: 0.02em;">隐藏人格 <span class="text-[12px] font-normal" style="color: hsl(var(--muted-foreground));">稀有人格 · 3 种</span></h2>
        <div class="grid grid-cols-3 gap-3">
          <div
            v-for="t in hidden" :key="t.code"
            class="p-4 text-center transition-all duration-150 cursor-pointer"
            :class="isCollected(t) ? 'hover:-translate-y-0.5' : 'opacity-90'"
            style="background: linear-gradient(135deg, hsl(var(--muted)), hsl(var(--card))); border: 1px dashed hsl(var(--border)); border-radius: var(--radius);"
            @click="openDetail(t)"
          >
            <template v-if="isCollected(t)">
              <div class="text-[26px] mb-1.5">{{ emojiFor(t) }}</div>
              <div class="text-[13px] font-mono font-bold mb-1" style="color: hsl(var(--foreground));">{{ t.code }}</div>
              <p class="text-[11px] leading-[1.5]" style="color: hsl(var(--muted-foreground));">{{ t.unlockCondition || '达成条件解锁' }}</p>
            </template>
            <template v-else>
              <div class="text-[26px] mb-1.5 opacity-50">🔒</div>
              <div class="text-[13px] font-mono font-bold mb-1" style="color: hsl(var(--muted-foreground));">？？？</div>
              <p class="text-[11px] leading-[1.5]" style="color: hsl(var(--muted-foreground)); opacity: 0.7;">特殊条件解锁</p>
            </template>
          </div>
        </div>
      </section>

      <p class="text-[11px] text-center pt-4" style="color: hsl(var(--muted-foreground));">人格仅供娱乐参考，你的样子由你自己定义</p>

    </div>

    <!-- ═══ 详情弹窗（仅已收集） ═══ -->
    <transition name="fade">
      <div v-if="selected" class="modal-overlay" @click="closeDetail">
        <div class="modal gallery-detail" @click.stop>
          <div class="modal-header">
            <h3>{{ selected.name }}</h3>
            <button class="close-btn" @click="closeDetail">&times;</button>
          </div>
          <div class="modal-body" style="align-items: stretch;">
            <div class="aspect-[1.5] w-full overflow-hidden rounded-xl mb-3">
              <img
                v-if="!selected.isHidden && getNftiIllustration(selected.illustration)"
                :src="getNftiIllustration(selected.illustration)"
                :alt="selected.name"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex flex-col items-center justify-center gap-2 text-[40px]" style="background: hsl(var(--muted));">
                <span>{{ selected.isHidden ? '🔒' : emojiFor(selected) }}</span>
                <span v-if="selected.isHidden" class="text-[13px] font-medium" style="color: hsl(var(--muted-foreground));">{{ selected.unlockCondition || '达成条件解锁' }}</span>
              </div>
            </div>
            <div v-if="nftiCodeDisplay(selected)" class="mb-2">
              <span class="inline-block text-[12px] font-mono font-bold px-2.5 py-1 rounded-full" style="background: hsl(var(--primary) / 0.1); color: hsl(var(--primary));">{{ nftiCodeDisplay(selected) }}</span>
              <span v-if="selected.isHidden" class="inline-block text-[12px] font-bold px-2.5 py-1 rounded-full ml-1.5" style="background: hsl(var(--muted)); color: hsl(var(--muted-foreground));">隐藏人格</span>
            </div>
            <p class="text-[13px] leading-[1.8] mb-2" style="color: hsl(var(--foreground));">{{ selected.description }}</p>
            <p v-if="selected.detail" class="text-[13px] leading-[1.8]" style="color: hsl(var(--muted-foreground));">{{ selected.detail }}</p>
          </div>
        </div>
      </div>
    </transition>
  </main>
</template>

<style scoped>
.line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.gt-text-btn { background: none; border: none; color: hsl(var(--muted-foreground)); cursor: pointer; transition: color 150ms ease; }
.gt-text-btn:hover { color: hsl(var(--foreground)); }
.close-btn { font-size: 22px; font-weight: 600; color: hsl(var(--muted-foreground)); background: none; border: none; cursor: pointer; line-height: 1; }
.close-btn:hover { color: hsl(var(--foreground)); }
</style>
