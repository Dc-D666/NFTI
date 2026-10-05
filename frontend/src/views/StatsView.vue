<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getStoredSession } from '@/services/channelAuth'
import { dbGetStats } from '@/services/channelDb'
import type { StatsData } from '@/services/channelDb'
import { fullTypes, quickTypes } from '@/data/personalities'
import { getNftiCode } from '@/utils/illustrations'

const router = useRouter()
const loading = ref(true)
const stats = ref<StatsData | null>(null)

// 所有已知人格的 code -> NFTI 四维度代码映射（如 OVEF / OGLS，非 MBTI 的 ESTJ）
// 统计页不展示人格名称：人格名需通过测试解锁，或去图鉴探索（保持神秘感）
const nftiLabelMap: Record<string, string> = {}
for (const t of quickTypes) nftiLabelMap[t.code] = getNftiCode(t.illustration, t.code)
for (const t of fullTypes) nftiLabelMap[t.code] = getNftiCode(t.illustration, t.code)

// 霍兰德维度标准名称（替换校园角色名）
const hollandStdNames: Record<string, string> = {
  R: '🔧 现实型', I: '🔬 研究型', A: '🎨 艺术型',
  S: '🤝 社会型', E: '💼 企业型', C: '📋 常规型',
}

onMounted(async () => {
  const stored = getStoredSession()
  if (!stored?.sessionId) {
    router.push('/')
    return
  }

  try {
    const result = await dbGetStats()
    if (result.success && result.data) {
      stats.value = result.data
    }
  } catch (_) {}
  loading.value = false
})

// NFTI 人格分布（按人数降序，四字母代码标识）
const nftiList = computed(() => {
  if (!stats.value) return []
  const dist = stats.value.nfti_distribution
  const entries = Object.entries(dist).map(([code, count]) => ({
    code,
    label: nftiLabelMap[code] || code,
    count,
  }))
  entries.sort((a, b) => b.count - a.count)
  const total = entries.reduce((s, e) => s + e.count, 0)
  return entries.map(e => ({ ...e, pct: total > 0 ? Math.round((e.count / total) * 100) : 0 }))
})

// 霍兰德底色分布（按第一字母分组）
const hollandList = computed(() => {
  if (!stats.value) return []
  const dist = stats.value.holland_distribution
  const grouped: Record<string, number> = {}
  for (const [code, count] of Object.entries(dist)) {
    const first = code[0] || '?'
    grouped[first] = (grouped[first] || 0) + count
  }
  const dimOrder = ['R', 'I', 'A', 'S', 'E', 'C']
  const entries = dimOrder.map(d => ({
    code: d,
    name: hollandStdNames[d] || d,
    count: grouped[d] || 0,
  }))
  entries.sort((a, b) => b.count - a.count)
  const total = entries.reduce((s, e) => s + e.count, 0)
  return entries.map(e => ({ ...e, pct: total > 0 ? Math.round((e.count / total) * 100) : 0 }))
})

const maxNfti = computed(() => nftiList.value[0]?.count || 1)
const maxHolland = computed(() => hollandList.value[0]?.count || 1)

function fmt(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}
</script>

<template>
  <div class="stats-page">
    <div class="bg-blob blob-1" aria-hidden="true"></div>
    <div class="bg-blob blob-2" aria-hidden="true"></div>
    <div class="content">
      <div class="top-bar">
        <button class="back-btn" @click="router.push('/')">← 返回首页</button>
      </div>

      <div v-if="loading" class="loading-box">
        <div class="loading-spinner"></div>
        <span>加载中...</span>
      </div>

      <template v-else-if="stats">
        <div class="page-title">
          <h1>大家都是什么南方人</h1>
          <p class="page-sub">南方中学频道真实数据 · 持续更新</p>
        </div>

        <!-- 数字卡片 -->
        <div class="stat-cards">
          <div class="stat-card">
            <div class="stat-number">{{ fmt(stats.page_visits) }}</div>
            <div class="stat-label">页面访问</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">{{ fmt(stats.counter) }}</div>
            <div class="stat-label">测试完成</div>
          </div>
        </div>

        <!-- NFTI 人格分布 -->
        <div class="section">
          <h2 class="section-title">🧠 NFTI 人格分布</h2>
          <p class="section-hint">用 NFTI 代码展示 · 完成测试或逛图鉴解锁人格名称</p>
          <div v-if="!nftiList.length" class="empty-state">还没有人测过 NFTI</div>
          <div v-else class="dist-list">
            <div v-for="item in nftiList" :key="item.code" class="dist-row">
              <div class="dist-bar-track">
                <div
                  class="dist-bar-fill nfti-bar"
                  :style="{ width: Math.max((item.count / maxNfti) * 100, 2) + '%' }"
                ></div>
              </div>
              <div class="dist-info">
                <span class="dist-code">{{ item.label }}</span>
                <span class="dist-count">{{ item.count }}<span class="dist-pct"> ({{ item.pct }}%)</span></span>
              </div>
            </div>
          </div>
        </div>

        <!-- 霍兰德底色分布 -->
        <div class="section">
          <h2 class="section-title">💼 职业底色分布</h2>
          <p class="section-hint">按霍兰德代码的第一位（主要倾向）统计</p>
          <div v-if="!hollandList.length" class="empty-state">还没有人测过霍兰德</div>
          <div v-else class="dist-list">
            <div v-for="item in hollandList" :key="item.code" class="dist-row">
              <div class="dist-bar-track">
                <div
                  class="dist-bar-fill holland-bar"
                  :style="{ width: Math.max((item.count / maxHolland) * 100, 2) + '%' }"
                ></div>
              </div>
              <div class="dist-info">
                <span class="dist-code holland-code">{{ item.code }}</span>
                <span class="dist-name">{{ item.name }}</span>
                <span class="dist-count">{{ item.count }}<span class="dist-pct"> ({{ item.pct }}%)</span></span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.stats-page {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  background: var(--color-bg);
}
.bg-blob {
  position: fixed;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.35;
  pointer-events: none;
  z-index: 0;
}
.blob-1 { width: 400px; height: 400px; background: var(--indigo-200); top: -120px; left: -80px; }
.blob-2 { width: 350px; height: 350px; background: var(--amber-200); bottom: -100px; right: -80px; }
.content {
  position: relative;
  z-index: 1;
  max-width: 560px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-5);
}
.top-bar {
  margin-bottom: var(--space-4);
}
.back-btn {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary);
  background: var(--indigo-50);
  border: 1px solid var(--indigo-100);
  border-radius: 10px;
  padding: 8px 16px;
  cursor: pointer;
}
.loading-box {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: var(--space-10);
  color: var(--gray-400);
}
.loading-spinner {
  width: 24px; height: 24px;
  border: 3px solid var(--indigo-100);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.page-title {
  text-align: center;
  margin-bottom: var(--space-8);
}
.page-title h1 {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  color: var(--gray-900);
  margin: 0 0 var(--space-2);
}
.page-sub {
  font-size: 14px;
  color: var(--gray-400);
  margin: 0;
}

/* ---- Stat Cards ---- */
.stat-cards {
  display: flex;
  gap: var(--space-4);
  margin-bottom: var(--space-8);
}
.stat-card {
  flex: 1;
  background: var(--gray-0);
  border: 1.5px solid var(--color-border);
  border-radius: 20px;
  padding: var(--space-5);
  text-align: center;
}
.stat-number {
  font-family: var(--font-display);
  font-size: 36px;
  font-weight: 700;
  color: var(--color-primary);
  line-height: 1.1;
  margin-bottom: var(--space-1);
}
.stat-label {
  font-size: 13px;
  color: var(--gray-500);
  font-weight: 500;
}

/* ---- Section ---- */
.section {
  margin-bottom: var(--space-8);
}
.section-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  color: var(--gray-900);
  margin: 0 0 var(--space-1);
}
.section-hint {
  font-size: 13px;
  color: var(--gray-400);
  margin: 0 0 var(--space-4);
}
.empty-state {
  text-align: center;
  padding: var(--space-8);
  color: var(--gray-400);
  font-size: 14px;
  background: var(--gray-0);
  border: 1.5px solid var(--color-border);
  border-radius: 16px;
}

/* ---- Distribution List ---- */
.dist-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--gray-0);
  border: 1.5px solid var(--color-border);
  border-radius: 16px;
  padding: var(--space-4);
  margin-top: var(--space-4);
}
.dist-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 6px 0;
}
.dist-bar-track {
  width: 48px;
  height: 6px;
  border-radius: 3px;
  background: var(--gray-100);
  flex-shrink: 0;
  overflow: hidden;
}
.dist-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 600ms var(--ease-out-quint);
}
.nfti-bar {
  background: linear-gradient(90deg, var(--indigo-400), var(--indigo-500));
}
.holland-bar {
  background: linear-gradient(90deg, var(--amber-400), var(--amber-500));
}
.dist-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.dist-code {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--indigo-600);
  white-space: nowrap;
  flex-shrink: 0;
}
.dist-code.holland-code {
  color: var(--amber-600);
}
.dist-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--gray-600);
  flex-shrink: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}
.dist-pct {
  font-weight: 400;
  color: var(--gray-400);
}

@media (max-width: 480px) {
  .content {
    padding: var(--space-5) var(--space-4);
  }
  .page-title h1 {
    font-size: 24px;
  }
  .stat-number {
    font-size: 28px;
  }
  .dist-code {
    font-size: 13px;
  }
  .dist-count {
    font-size: 11px;
  }
}
</style>
