<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  adminCheck,
  adminStatsTimeseries,
  adminTestRecords,
  dbGetStats,
  dbGetCollectionStats,
  inviteGenerate,
  inviteList,
  inviteUpdate,
  inviteDelete,
  type StatsData,
  type TimeseriesPoint,
  type TestRecord,
  type InviteCodeRow,
} from '@/services/channelDb'

const router = useRouter()

const loading = ref(true)
const unauthorized = ref(false)
const activeTab = ref<'dashboard' | 'invites'>('dashboard')

const stats = ref<StatsData | null>(null)
const collectionStats = ref<{ nfti_counts: number[]; career_counts: number[] } | null>(null)
const timeseries = ref<TimeseriesPoint[]>([])
const records = ref<TestRecord[]>([])
const invites = ref<InviteCodeRow[]>([])

// 邀请码生成
const genCount = ref(5)
const generating = ref(false)
const genResult = ref<string[]>([])
const actionMsg = ref('')

function fmt(n: number): string {
  return n >= 10000 ? (n / 10000).toFixed(1) + 'w' : String(n)
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  // 数据库存的是 UTC 时间（后端 now() 用 toISOString），展示时转成 UTC+8。
  // 兼容两种格式：后端 now() 的 "2026-08-07 04:10:30.491"（空格、无时区）与
  // mysql2 驱动序列化后的 ISO "2026-08-07T04:10:30.491Z"（带 T 和 Z）。
  let iso = s.includes('T') ? s : s.replace(' ', 'T')
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) iso += 'Z'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return s.replace('T', ' ').slice(0, 16)
  const t = new Date(d.getTime() + 8 * 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`
}

/** 指纹脱敏：fp_ab12…89cd */
function maskFp(fp: string | null): string {
  if (!fp) return '未绑定'
  if (fp.length <= 12) return fp
  return fp.slice(0, 6) + '…' + fp.slice(-4)
}

// ─── 数据加载 ───
async function loadAll() {
  loading.value = true
  actionMsg.value = ''
  try {
    const [s, cs, ts, tr, il] = await Promise.all([
      dbGetStats(),
      dbGetCollectionStats(),
      adminStatsTimeseries(30),
      adminTestRecords(30),
      inviteList(),
    ])
    if (s.success && s.data) stats.value = s.data
    if (cs.success && cs.data) collectionStats.value = cs.data
    if (ts.success && ts.data) timeseries.value = ts.data
    if (tr.success && tr.data) records.value = tr.data
    if (il.success && il.data) invites.value = il.data
  } catch (_) {
    actionMsg.value = '数据加载失败'
  }
  loading.value = false
}

onMounted(async () => {
  // 纵深防御：路由守卫已查过，页面挂载再查一次（守卫缓存过期场景）
  try {
    const check = await adminCheck(false)
    if (!check.isAdmin) {
      unauthorized.value = true
      loading.value = false
      return
    }
    await loadAll()
  } catch {
    // 网络异常：fail-closed 显示无权访问（否定结果不缓存，刷新页面可重试）
    unauthorized.value = true
    loading.value = false
    actionMsg.value = '权限校验失败，请重新校验'
  }
})

async function refreshPermission() {
  try {
    const check = await adminCheck(true)
    if (!check.isAdmin) {
      unauthorized.value = true
      return
    }
    unauthorized.value = false
    actionMsg.value = '权限已刷新'
    await loadAll()
  } catch {
    actionMsg.value = '权限校验失败，请重试'
  }
}

// ─── 图鉴收集覆盖 ───
const collectStats = computed(() => {
  const arr = collectionStats.value?.nfti_counts || []
  if (!arr.length) return null
  const total = arr.length
  const pct = (n: number) => Math.round((arr.filter(v => v >= n).length / total) * 100)
  return { total, pct1: pct(1), pct5: pct(5), pct10: pct(10), pct15: pct(15), max: Math.max(...arr) }
})

// ─── 测试记录展示辅助 ───
function recordName(r: TestRecord): string {
  if (r.nick) return r.nick
  if (r.tiny_id) return '频道用户'
  return '游客'
}

function recordType(r: TestRecord): string {
  return r.assessment_type === 'holland' ? '霍兰德' : 'NFTI'
}

function recordMode(mode: string): string {
  if (mode === 'quick') return '快速'
  if (mode === 'debug') return '调试'
  return '完整'
}

// ─── 30 天趋势（纯 CSS 柱状图，三组：NFTI / 霍兰德 / 新用户） ───
const trendMax = computed(() => {
  let m = 1
  for (const p of timeseries.value) {
    m = Math.max(m, p.nfti_count, p.holland_count, p.new_users)
  }
  return m
})

function barH(v: number): string {
  return Math.max((v / trendMax.value) * 100, 1.5) + '%'
}

function shortDate(d: string): string {
  return d.slice(5)
}

function showDate(i: number): boolean {
  return i === 0 || i % 5 === 0 || i === timeseries.value.length - 1
}

// ─── 邀请码操作 ───
function statusText(row: InviteCodeRow): string {
  if (row.multi_use) return '超级码'
  return row.used ? '已使用' : '未使用'
}

async function doGenerate() {
  generating.value = true
  actionMsg.value = ''
  try {
    const count = Math.max(1, Math.min(Math.round(genCount.value) || 5, 20))
    const res = await inviteGenerate(count)
    if (res.success && res.codes && res.codes.length) {
      genResult.value = res.codes
      actionMsg.value = `已生成 ${res.codes.length} 个邀请码`
      await loadAll()
    } else {
      actionMsg.value = res.error || '生成失败'
    }
  } catch (_) {
    actionMsg.value = '生成失败'
  }
  generating.value = false
}

async function copyCodes() {
  try {
    await navigator.clipboard.writeText(genResult.value.join('\n'))
    actionMsg.value = '已复制到剪贴板'
  } catch (_) {
    actionMsg.value = '复制失败，请手动选择复制'
  }
}

async function toggleSuper(row: InviteCodeRow) {
  actionMsg.value = ''
  try {
    const res = await inviteUpdate(row.code, !row.multi_use)
    if (res.success) {
      actionMsg.value = row.multi_use ? `${row.code} 已取消超级码` : `${row.code} 已设为超级码`
      await loadAll()
    } else {
      actionMsg.value = res.error || '操作失败'
    }
  } catch (_) {
    actionMsg.value = '操作失败'
  }
}

async function askDelete(row: InviteCodeRow) {
  if (!window.confirm(`确定删除邀请码 ${row.code}？\n删除后不可恢复。`)) return
  actionMsg.value = ''
  try {
    const res = await inviteDelete(row.code)
    if (res.success) {
      actionMsg.value = `${row.code} 已删除`
      await loadAll()
    } else {
      actionMsg.value = res.error || '删除失败'
    }
  } catch (_) {
    actionMsg.value = '删除失败'
  }
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

      <div v-else-if="unauthorized" class="empty-state">
        无权访问 · 仅频道主/管理员可用
        <div class="retry-wrap"><button class="back-btn" @click="refreshPermission">重新校验</button></div>
      </div>

      <template v-else>
        <div class="page-title">
          <h1>管理后台</h1>
          <p class="page-sub">数据看板 · 邀请码管理</p>
        </div>

        <!-- Tab 切换 -->
        <div class="tabs">
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'dashboard' }"
            @click="activeTab = 'dashboard'"
          >📊 数据看板</button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'invites' }"
            @click="activeTab = 'invites'"
          >🔑 邀请码</button>
          <button class="tab-btn ghost" @click="refreshPermission">↻ 刷新权限</button>
        </div>

        <p v-if="actionMsg" class="action-msg">{{ actionMsg }}</p>

        <!-- ═══ Tab 1：数据看板 ═══ -->
        <template v-if="activeTab === 'dashboard'">
          <!-- KPI 卡片 -->
          <div class="stat-cards" v-if="stats">
            <div class="stat-card">
              <div class="stat-number">{{ fmt(stats.counter) }}</div>
              <div class="stat-label">测试完成</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">{{ fmt(stats.page_visits) }}</div>
              <div class="stat-label">页面访问</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">{{ fmt(stats.total_users) }}</div>
              <div class="stat-label">注册用户</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">{{ fmt(stats.total_results) }}</div>
              <div class="stat-label">测试记录</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">{{ fmt(stats.total_ai_chats) }}</div>
              <div class="stat-label">AI 对话</div>
            </div>
          </div>

          <!-- 30 天趋势 -->
          <div class="section">
            <h2 class="section-title">📈 近 30 天趋势</h2>
            <p class="section-hint">每天 NFTI / 霍兰德完成数 + 新增用户（悬停查看数值）</p>
            <div v-if="!timeseries.length" class="empty-state">暂无趋势数据</div>
            <div v-else class="trend-card">
              <div class="trend-chart">
                <div v-for="(p, i) in timeseries" :key="p.date" class="trend-col">
                  <div
                    class="trend-bars"
                    :title="`${p.date} · NFTI ${p.nfti_count} · 霍兰德 ${p.holland_count} · 新用户 ${p.new_users}`"
                  >
                    <span class="trend-val">{{ p.nfti_count }}/{{ p.holland_count }}/{{ p.new_users }}</span>
                    <div class="trend-bar nfti" :style="{ height: barH(p.nfti_count) }"></div>
                    <div class="trend-bar holland" :style="{ height: barH(p.holland_count) }"></div>
                    <div class="trend-bar users" :style="{ height: barH(p.new_users) }"></div>
                  </div>
                  <div class="trend-date">{{ showDate(i) ? shortDate(p.date) : '' }}</div>
                </div>
              </div>
              <div class="trend-legend">
                <span><i class="dot nfti"></i>NFTI</span>
                <span><i class="dot holland"></i>霍兰德</span>
                <span><i class="dot users"></i>新用户</span>
              </div>
            </div>
          </div>

          <!-- 最近测试记录 -->
          <div class="section">
            <h2 class="section-title">🕒 最近测试记录</h2>
            <p class="section-hint">最近 30 条 · 含游客（调试模式不计入统计但会显示）</p>
            <div v-if="!records.length" class="empty-state">还没有测试记录</div>
            <div v-else class="record-list">
              <div v-for="(r, i) in records" :key="i" class="record-row">
                <div class="record-left">
                  <span class="record-name">{{ recordName(r) }}</span>
                  <span class="record-time">{{ fmtDate(r.created_at) }}</span>
                </div>
                <div class="record-right">
                  <span class="record-type" :class="r.assessment_type === 'holland' ? 'holland' : 'nfti'">{{ recordType(r) }}</span>
                  <span class="record-result">{{ r.type_name }}<span class="record-code">{{ r.type_code }}</span></span>
                  <span class="record-mode">{{ recordMode(r.mode) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 图鉴收集覆盖 -->
          <div class="section">
            <h2 class="section-title">🏆 图鉴收集覆盖</h2>
            <p class="section-hint">已测用户中收集到 N 个人格的比例</p>
            <div v-if="!collectStats" class="empty-state">暂无收集数据</div>
            <div v-else class="collect-grid">
              <div class="collect-cell"><div class="collect-num">{{ collectStats.pct1 }}%</div><div class="collect-label">≥1 个人格</div></div>
              <div class="collect-cell"><div class="collect-num">{{ collectStats.pct5 }}%</div><div class="collect-label">≥5 个</div></div>
              <div class="collect-cell"><div class="collect-num">{{ collectStats.pct10 }}%</div><div class="collect-label">≥10 个</div></div>
              <div class="collect-cell"><div class="collect-num">{{ collectStats.pct15 }}%</div><div class="collect-label">≥15 个</div></div>
              <div class="collect-cell"><div class="collect-num">{{ collectStats.total }}</div><div class="collect-label">覆盖用户</div></div>
              <div class="collect-cell"><div class="collect-num">{{ collectStats.max }}</div><div class="collect-label">最高收集</div></div>
            </div>
          </div>
        </template>

        <!-- ═══ Tab 2：邀请码管理 ═══ -->
        <template v-else>
          <!-- 生成 -->
          <div class="section">
            <h2 class="section-title">🪙 生成邀请码</h2>
            <p class="section-hint">生成 1–20 个 · 未使用的码可设为超级码（不限设备）</p>
            <div class="gen-row">
              <input v-model.number="genCount" type="number" min="1" max="20" class="gen-input" />
              <button class="gen-btn" :disabled="generating" @click="doGenerate">
                {{ generating ? '生成中...' : '生成' }}
              </button>
            </div>
            <div v-if="genResult.length" class="gen-result">
              <div class="gen-codes">{{ genResult.join(' ').replace(/\s+/g, '  ') }}</div>
              <button class="copy-btn" @click="copyCodes">复制全部</button>
            </div>
          </div>

          <!-- 列表 -->
          <div class="section">
            <h2 class="section-title">📋 邀请码列表</h2>
            <p class="section-hint">共 {{ invites.length }} 个</p>
            <div v-if="!invites.length" class="empty-state">还没有邀请码</div>
            <div v-else class="invite-list">
              <div v-for="row in invites" :key="row.code" class="invite-row">
                <div class="invite-head">
                  <span class="invite-code">{{ row.code }}</span>
                  <span class="invite-status" :class="{ used: row.used, super: row.multi_use }">{{ statusText(row) }}</span>
                </div>
                <div class="invite-meta">
                  <span>创建 {{ fmtDate(row.created_at) }}</span>
                  <span v-if="row.used_at"> · 使用 {{ fmtDate(row.used_at) }}</span>
                  <span> · {{ maskFp(row.browser_fingerprint) }}</span>
                </div>
                <div class="invite-actions">
                  <button class="mini-btn" @click="toggleSuper(row)">{{ row.multi_use ? '取消超级码' : '设为超级码' }}</button>
                  <button class="mini-btn danger" @click="askDelete(row)">删除</button>
                </div>
              </div>
            </div>
          </div>
        </template>
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
.top-bar { margin-bottom: var(--space-4); }
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
  margin-bottom: var(--space-6);
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

/* ---- Tabs ---- */
.tabs {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
}
.tab-btn {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: var(--gray-500);
  background: var(--gray-0);
  border: 1.5px solid var(--color-border);
  border-radius: 12px;
  padding: 10px 8px;
  cursor: pointer;
  transition: all 150ms ease;
}
.tab-btn.active {
  color: var(--color-primary);
  background: var(--indigo-50);
  border-color: var(--indigo-200);
}
.tab-btn.ghost {
  flex: 0 0 auto;
  font-size: 13px;
  padding: 10px 12px;
}
.action-msg {
  font-size: 13px;
  color: var(--gray-500);
  background: var(--gray-0);
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  padding: 8px 12px;
  margin: 0 0 var(--space-5);
  text-align: center;
}

.retry-wrap {
  margin-top: 12px;
}

/* ---- Stat Cards ---- */
.stat-cards {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-8);
}
.stat-card {
  flex: 1 1 calc(33% - var(--space-3));
  min-width: 90px;
  background: var(--gray-0);
  border: 1.5px solid var(--color-border);
  border-radius: 20px;
  padding: var(--space-4) var(--space-3);
  text-align: center;
}
.stat-number {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  color: var(--color-primary);
  line-height: 1.1;
  margin-bottom: var(--space-1);
}
.stat-label {
  font-size: 12px;
  color: var(--gray-500);
  font-weight: 500;
}

/* ---- Section ---- */
.section { margin-bottom: var(--space-8); }
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

/* ---- Recent test records ---- */
.record-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
.record-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  background: var(--gray-0);
  border: 1.5px solid var(--color-border);
  border-radius: 14px;
  padding: 10px 14px;
  transition: border-color 150ms ease;
}
.record-row:hover { border-color: var(--indigo-200); }
.record-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.record-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--gray-800);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}
.record-time {
  font-size: 11px;
  color: var(--gray-400);
  font-variant-numeric: tabular-nums;
}
.record-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.record-type {
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  padding: 3px 9px;
  white-space: nowrap;
}
.record-type.nfti { color: var(--indigo-600); background: var(--indigo-50); }
.record-type.holland { color: var(--amber-700); background: var(--amber-100); }
.record-result {
  font-size: 13px;
  font-weight: 600;
  color: var(--gray-700);
  white-space: nowrap;
}
.record-code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--gray-400);
  margin-left: 4px;
}
.record-mode {
  font-size: 11px;
  color: var(--gray-400);
  background: var(--gray-100);
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
}

/* ---- Trend chart ---- */
.trend-card {
  background: var(--gray-0);
  border: 1.5px solid var(--color-border);
  border-radius: 20px;
  padding: var(--space-5) var(--space-4) var(--space-4);
  margin-top: var(--space-4);
}
.trend-chart {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 180px;
  padding-top: 26px;
  background:
    repeating-linear-gradient(
      to top,
      transparent 0,
      transparent 34px,
      rgba(80, 60, 20, 0.05) 34px,
      rgba(80, 60, 20, 0.05) 35px
    );
  border-bottom: 1px solid var(--color-border);
}
.trend-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  min-width: 0;
}
.trend-bars {
  position: relative;
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  padding-bottom: 4px;
}
.trend-val {
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  color: var(--gray-500);
  background: var(--gray-0);
  border: 1px solid var(--color-border);
  border-radius: 7px;
  padding: 1px 6px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 150ms ease;
  z-index: 2;
}
.trend-col:hover .trend-val { opacity: 1; }
.trend-bar {
  width: 30%;
  max-width: 10px;
  min-height: 2px;
  border-radius: 4px 4px 1px 1px;
  transition: height 400ms var(--ease-out-quint), filter 150ms ease;
}
.trend-bar.nfti { background: linear-gradient(180deg, var(--indigo-300), var(--indigo-500)); }
.trend-bar.holland { background: linear-gradient(180deg, var(--amber-300), var(--amber-500)); }
.trend-bar.users { background: linear-gradient(180deg, #86efac, #10b981); }
.trend-col:hover .trend-bar { filter: brightness(1.1); }
.trend-date {
  font-size: 9px;
  color: var(--gray-400);
  margin-top: 4px;
  height: 12px;
  font-variant-numeric: tabular-nums;
}
.trend-legend {
  display: flex;
  justify-content: center;
  gap: var(--space-4);
  margin-top: var(--space-3);
  font-size: 12px;
  color: var(--gray-500);
}
.trend-legend span { display: inline-flex; align-items: center; gap: 5px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.nfti { background: var(--indigo-400); }
.dot.holland { background: var(--amber-400); }
.dot.users { background: #10b981; }

/* ---- Collection coverage ---- */
.collect-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
  margin-top: var(--space-4);
}
.collect-cell {
  background: var(--gray-0);
  border: 1.5px solid var(--color-border);
  border-radius: 14px;
  padding: var(--space-4) var(--space-2);
  text-align: center;
}
.collect-num {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--color-primary);
}
.collect-label {
  font-size: 12px;
  color: var(--gray-400);
  margin-top: 2px;
}

/* ---- Invite generate ---- */
.gen-row {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
.gen-input {
  width: 90px;
  font-size: 15px;
  font-weight: 600;
  text-align: center;
  color: var(--gray-800);
  background: var(--gray-0);
  border: 1.5px solid var(--color-border);
  border-radius: 12px;
  padding: 10px;
}
.gen-btn {
  flex: 1;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-primary);
  background: var(--indigo-100);
  border: 1.5px solid var(--indigo-200);
  border-radius: 12px;
  padding: 10px;
  cursor: pointer;
}
.gen-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.gen-result {
  margin-top: var(--space-4);
  background: var(--gray-0);
  border: 1.5px solid var(--color-border);
  border-radius: 14px;
  padding: var(--space-4);
}
.gen-codes {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.9;
  color: var(--gray-700);
  word-break: break-all;
  margin-bottom: var(--space-3);
}
.copy-btn {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary);
  background: var(--gray-0);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 6px 14px;
  cursor: pointer;
}

/* ---- Invite list ---- */
.invite-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
.invite-row {
  background: var(--gray-0);
  border: 1.5px solid var(--color-border);
  border-radius: 14px;
  padding: var(--space-4);
}
.invite-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}
.invite-code {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--gray-800);
  word-break: break-all;
}
.invite-status {
  font-size: 12px;
  font-weight: 600;
  color: var(--indigo-600);
  background: var(--indigo-50);
  border-radius: 999px;
  padding: 3px 10px;
  white-space: nowrap;
  flex-shrink: 0;
}
.invite-status.used { color: var(--gray-500); background: var(--gray-100); }
.invite-status.super { color: var(--amber-700); background: var(--amber-100); }
.invite-meta {
  font-size: 12px;
  color: var(--gray-400);
  margin-bottom: var(--space-3);
  font-variant-numeric: tabular-nums;
}
.invite-actions {
  display: flex;
  gap: var(--space-2);
}
.mini-btn {
  font-size: 12px;
  font-weight: 600;
  color: var(--indigo-600);
  background: var(--indigo-50);
  border: 1px solid var(--indigo-100);
  border-radius: 8px;
  padding: 5px 12px;
  cursor: pointer;
}
.mini-btn.danger {
  color: var(--destructive, #dc2626);
  background: #fef2f2;
  border-color: #fecaca;
}

@media (max-width: 480px) {
  .content { padding: var(--space-5) var(--space-4); }
  .page-title h1 { font-size: 24px; }
  .stat-number { font-size: 22px; }
  .record-name { max-width: 110px; font-size: 13px; }
  .record-result { font-size: 12px; }
  .record-code { display: none; }
  .trend-chart { height: 150px; }
  .collect-num { font-size: 18px; }
}
</style>
