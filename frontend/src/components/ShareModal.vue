<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { toCanvas } from 'dom-to-image-more'
import type { PersonalityType, DimensionScores, TestMode } from '@/types'
import { getRelations } from '@/data/relationships'
import qrCodeImg from '@/assets/qrcodev2.png'
import { publishShare } from '@/services/channelAuth'

const props = defineProps<{
  show: boolean
  mode: TestMode
  type: PersonalityType
  scores: DimensionScores
  illustrationUrl?: string
  isLoggedIn?: boolean
  sessionId?: string
  /** 默契度分享链接（有则印在分享卡片上） */
  matchUrl?: string
}>()

const emit = defineEmits<{ close: [] }>()

const shareCardRef = ref<HTMLDivElement | null>(null)
const isGenerating = ref(false)
const savedImageUrl = ref<string | null>(null)
const feedUrl = ref('')

const isPublishing = ref(false)
const publishStatus = ref<'progress' | 'success' | 'failed'>('progress')
const publishSteps = ref<{ step: number; text: string; status: string }[]>([])

const dimensionPairs = computed(() => {
  const s = props.scores
  return [
    { label: '社交电量', left: 'O', right: 'R', leftScore: s.E, rightScore: s.I },
    { label: '信息偏好', left: 'G', right: 'V', leftScore: s.S, rightScore: s.N },
    { label: '决策风格', left: 'L', right: 'E', leftScore: s.T, rightScore: s.F },
    { label: '生活节奏', left: 'S', right: 'F', leftScore: s.J, rightScore: s.P },
  ]
})

const bestMatch = computed(() => {
  const relations = getRelations(props.type.code)
  return relations.find(r => r.type === '绝配') || null
})

function getDimensionPct(leftScore: number, rightScore: number) {
  const diff = leftScore - rightScore
  const maxPossibleDiff = props.mode === 'quick' ? 9 : 36
  const intensity = Math.min(Math.abs(diff) / maxPossibleDiff, 1)
  const dominantPct = Math.round(50 + intensity * 50)
  const weakPct = 100 - dominantPct
  const winner = diff >= 0 ? 'left' : 'right'
  return { leftPct: diff >= 0 ? dominantPct : weakPct, rightPct: diff >= 0 ? weakPct : dominantPct, winner }
}

function getNftiLetter(mbtiLetter: string): string {
  const map: Record<string, string> = { E: 'O', I: 'R', S: 'G', N: 'V', T: 'L', F: 'E', J: 'S', P: 'F' }
  return map[mbtiLetter] || mbtiLetter
}

const nftiCode = computed(() => {
  if (!props.type.fourLetter) return props.type.code
  return props.type.fourLetter.split('').map(getNftiLetter).join('')
})

const shareText = computed(() => {
  return `我在【南方中学 NFTI 人格测评】里测出了【${props.type.name}】(${nftiCode.value})\n\n你也来测测你是哪种南方人 → https://nfti.weaxi.cn`
})

// 记录最近一次生成的卡片是否已含口令（用于"口令晚到补生成"判断）
const renderedWithUrl = ref(false)

async function generateCardImage() {
  if (!shareCardRef.value) return
  isGenerating.value = true
  try {
    // 等待字体加载完成，避免渲染时字体错位
    await document.fonts.ready
    await new Promise(r => setTimeout(r, 300))
    const el = shareCardRef.value
    // 使用库原生 scale 选项放大画布（对 ctx.scale() 生效，不修改 DOM 布局，
    // 避免 width 覆盖 + transform 缩放双重放大导致内容溢出画布）
    const canvas = await toCanvas(el, {
      scale: 3,
    })
    savedImageUrl.value = canvas.toDataURL('image/png')
    renderedWithUrl.value = !!props.matchUrl
  } catch { alert('生成图片失败，请尝试截图分享') }
  finally { isGenerating.value = false }
}

function downloadImage() {
  if (!savedImageUrl.value) { generateCardImage().then(() => { if (savedImageUrl.value) triggerDownload() }); return }
  triggerDownload()
}

function triggerDownload() {
  if (!savedImageUrl.value) return
  const link = document.createElement('a')
  link.download = 'NFTI_' + props.type.code + '_' + Date.now() + '.png'
  link.href = savedImageUrl.value
  link.click()
}

watch(() => props.show, (show) => {
  if (show) { savedImageUrl.value = null; nextTick(() => { setTimeout(() => generateCardImage(), 400) }) }
})

// 口令异步加载竞态：打开弹窗时口令可能尚未到达（首次生成缺口令），
// 口令到达后无条件补一次生成（用 renderedWithCode 标记，不依赖 savedImageUrl）
watch(() => props.matchUrl, (url) => {
  if (url && props.show && !renderedWithUrl.value) {
    nextTick(() => setTimeout(() => generateCardImage(), 250))
  }
})

function handlePublishToChannel() {
  if (!props.isLoggedIn || !props.sessionId) return
  if (!savedImageUrl.value) {
    isGenerating.value = true
    generateCardImage().then(() => { isGenerating.value = false; doPublish() })
    return
  }
  doPublish()
}

async function doPublish() {
  if (!props.sessionId || !savedImageUrl.value) return
  isPublishing.value = true; publishStatus.value = 'progress'; feedUrl.value = ''
  publishSteps.value = [
    { step: 1, text: '生成分享图片中...', status: 'done' },
    { step: 2, text: '构造发送请求中...', status: 'in_progress' },
    { step: 3, text: '连接服务器中...', status: 'pending' },
  ]
  await new Promise(r => setTimeout(r, 400))
  publishSteps.value[2] = { step: 3, text: '发布中...', status: 'in_progress' }
  try {
    const result = await publishShare(props.sessionId, shareText.value, savedImageUrl.value)
    if (result.success) {
      feedUrl.value = result.feedUrl || ''
      publishSteps.value = [
        { step: 1, text: '生成分享图片中...', status: 'done' },
        { step: 2, text: '构造发送请求中...', status: 'done' },
        { step: 3, text: '发布中...', status: 'done' },
      ]
      publishStatus.value = 'success'
    } else {
      publishSteps.value[2] = { step: 3, text: '❌ ' + (result.error || '发送失败'), status: 'failed' }
      publishStatus.value = 'failed'
    }
  } catch (err: any) {
    publishSteps.value[2] = { step: 3, text: '❌ ' + (err.message || '网络错误'), status: 'failed' }
    publishStatus.value = 'failed'
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="share-modal-overlay" @click.self="emit('close')">
        <Transition name="slide-up">
          <div v-if="show" class="share-modal">
            <div class="share-header">
              <h3>分享我的结果</h3>
              <button class="close-btn" @click="emit('close')" aria-label="关闭">✕</button>
            </div>

            <div ref="shareCardRef" class="share-card">
              <div class="card-brand-bar">
                <span class="brand-mark">NFTI</span>
                <span class="brand-divider"></span>
                <span class="brand-tag">你是哪种南方人？</span>
              </div>
              <div class="card-hero">
                <div class="card-illustration-wrap">
                  <img v-if="illustrationUrl" :src="illustrationUrl" :alt="type.name" class="card-illustration" />
                  <div v-else class="card-illustration-placeholder"><span>{{ type.code[0] }}</span></div>
                </div>
                <div class="card-identity">
                  <div class="card-code">{{ type.code }}</div>
                  <div class="card-name">{{ type.name }}</div>
                  <div v-if="type.fourLetter && !type.isHidden" class="card-nfti">{{ nftiCode }}</div>
                </div>
              </div>
              <div class="card-desc">{{ type.description }}</div>
              <div v-if="bestMatch" class="card-match">
                <div class="match-header"><span class="match-icon">💕</span><span class="match-label">绝配</span></div>
                <div class="match-target"><span class="match-nfti">{{ bestMatch.targetNfti }}</span><span class="match-name">{{ bestMatch.targetName }}</span></div>
                <p class="match-desc">{{ bestMatch.desc }}</p>
              </div>
              <div class="card-dims">
                <div v-for="pair in (mode === 'quick' ? dimensionPairs.slice(0, 2) : dimensionPairs)" :key="pair.label" class="dim-row">
                  <span class="dim-side" :class="{ active: getDimensionPct(pair.leftScore, pair.rightScore).winner === 'left' }">{{ pair.left }}</span>
                  <div class="dim-bar-track">
                    <div class="dim-bar-fill" :class="{ right: getDimensionPct(pair.leftScore, pair.rightScore).winner === 'right' }"
                      :style="{ width: Math.max(getDimensionPct(pair.leftScore, pair.rightScore).leftPct, getDimensionPct(pair.leftScore, pair.rightScore).rightPct) + '%', marginLeft: getDimensionPct(pair.leftScore, pair.rightScore).winner === 'right' ? 'auto' : '0' }">
                    </div>
                  </div>
                  <span class="dim-side" :class="{ active: getDimensionPct(pair.leftScore, pair.rightScore).winner === 'right' }">{{ pair.right }}</span>
                </div>
              </div>
              <div v-if="matchUrl" class="card-match-url">
                <span class="match-url-label">💞 默契分享</span>
                <span class="match-url-value">{{ matchUrl }}</span>
              </div>
              <div class="card-bottom">
                <div class="qr-section">
                  <img :src="qrCodeImg" alt="扫码测试" class="qr-code" />
                  <span class="qr-hint">扫码测测你是哪种南方人</span>
                </div>
                <div class="card-meta">
                  <span class="meta-mode">{{ mode === 'quick' ? '快速测试' : '完整测试' }}</span>
                  <span class="meta-url">nfti.weaxi.cn</span>
                </div>
              </div>
            </div>

            <div class="share-actions">
              <button class="share-action-btn primary" @click="downloadImage" :disabled="isGenerating">
                <span class="action-icon">💾</span>
                <span>{{ isGenerating ? '生成中...' : '分享图片' }}</span>
              </button>
              <button v-if="isLoggedIn" class="share-action-btn channel" @click="handlePublishToChannel">
                <span class="action-icon">📢</span>
                <span>一键发送至频道</span>
              </button>
            </div>

            <p v-if="isLoggedIn" class="share-tip channel-note">当前你已授权绑定频道账号，可一键发送分享。</p>
            <p class="share-tip">{{ !isLoggedIn ? '登录后可使用一键发送至频道功能' : (savedImageUrl ? 'QQ、微信内置浏览器无法保存图片，请直接截屏保存' : '正在生成分享图片...') }}</p>

            <Teleport to="body">
              <div v-if="isPublishing" class="publish-overlay" @click.self="() => {}">
                <div class="publish-modal">
                  <template v-if="publishStatus === 'progress' || publishStatus === 'failed'">
                    <h3 class="publish-title">📢 正在分享结果</h3>
                    <div class="publish-steps">
                      <div v-for="s in publishSteps" :key="s.step" class="publish-step" :class="s.status">
                        <span class="publish-step-icon">
                          <span v-if="s.status === 'done'">✅</span>
                          <span v-else-if="s.status === 'failed'">❌</span>
                          <span v-else-if="s.status === 'in_progress'" class="pub-spinner"></span>
                          <span v-else class="pub-pending">○</span>
                        </span>
                        <span class="publish-step-text">{{ s.text }}</span>
                      </div>
                    </div>
                    <button v-if="publishStatus === 'failed'" class="publish-close-btn" @click="isPublishing = false">关闭</button>
                  </template>
                  <template v-else>
                    <div class="publish-success">
                      <div class="success-icon-big">✅</div>
                      <h3 class="publish-title" style="margin-bottom:var(--space-2)">发布成功！</h3>
                      <p class="publish-success-desc">你的结果已分享至 NFTI 版块</p>
                      <div class="publish-actions">
                        <a v-if="feedUrl" :href="feedUrl" target="_blank" class="publish-btn primary">查看帖子</a>
                        <button class="publish-btn secondary" @click="isPublishing = false; emit('close')">返回</button>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </Teleport>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.share-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 1000; display: flex; align-items: flex-end; justify-content: center; }
.share-modal { background: var(--gray-0); border-radius: 24px 24px 0 0; width: 100%; max-width: 420px; max-height: 90vh; overflow-y: auto; padding: var(--space-5); padding-bottom: var(--space-8); }
.share-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.share-header h3 { font-family: var(--font-display); font-size: 18px; font-weight: 700; color: var(--gray-900); }
.close-btn { background: none; border: none; font-size: 20px; color: var(--gray-400); cursor: pointer; padding: var(--space-2); line-height: 1; }
.close-btn:hover { color: var(--gray-600); }
.share-card { background: #ffffff; border: 1px solid var(--gray-200); border-radius: 16px; padding: var(--space-4); margin-bottom: var(--space-5); position: relative; overflow: hidden; font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif; line-height: 1.5; color: var(--gray-900); }
.card-brand-bar { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-4); }
.brand-mark { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--color-primary); letter-spacing: 0.1em; }
.brand-divider { width: 1px; height: 12px; background: var(--gray-300); }
.brand-tag { font-size: 12px; color: var(--gray-400); }
.card-hero { display: flex; align-items: center; gap: var(--space-4); margin-bottom: var(--space-3); }
.card-illustration-wrap { flex-shrink: 0; }
.card-illustration { width: 120px; height: auto; max-height: 120px; object-fit: contain; border-radius: 12px; background: var(--gray-50); display: block; }
.card-illustration-placeholder { width: 120px; height: 80px; border-radius: 12px; background: linear-gradient(135deg, var(--indigo-100), var(--indigo-50)); display: flex; align-items: center; justify-content: center; }
.card-illustration-placeholder span { font-family: var(--font-display); font-size: 48px; font-weight: 700; color: var(--indigo-300); }
.card-identity { flex: 1; min-width: 0; }
.card-code { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 32px; font-weight: 700; color: var(--gray-900); line-height: 1; letter-spacing: -0.02em; }
.card-name { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 18px; font-weight: 700; color: var(--color-primary); margin-top: var(--space-1); }
.card-nfti { font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: var(--gray-400); letter-spacing: 0.12em; margin-top: 2px; }
.card-desc { font-size: 13px; line-height: 1.7; color: var(--gray-600); margin-bottom: var(--space-3); padding-bottom: var(--space-3); border-bottom: 1px solid var(--gray-100); }
.card-match { padding: var(--space-3); background: linear-gradient(135deg, #eef2ff, #f0fdf4); border: 1px solid #c7d2fe; border-radius: 12px; margin-bottom: var(--space-3); }
.match-header { display: flex; align-items: center; gap: var(--space-1); margin-bottom: var(--space-2); }
.match-icon { font-size: 12px; }
.match-label { font-size: 11px; font-weight: 700; color: var(--color-primary); letter-spacing: 0.04em; }
.match-target { display: flex; align-items: baseline; gap: var(--space-2); margin-bottom: var(--space-1); }
.match-nfti { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--color-primary); letter-spacing: 0.08em; }
.match-name { font-size: 14px; font-weight: 600; color: var(--gray-700); }
.match-desc { font-size: 12px; line-height: 1.6; color: var(--gray-500); margin: 0; }
.card-dims { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }
.card-match-url { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: var(--space-2); background: var(--amber-50, #fffbeb); border: 1px dashed var(--amber-400, #fbbf24); border-radius: 10px; margin-bottom: var(--space-3); }
.match-url-label { font-size: 11px; font-weight: 600; color: var(--amber-700, #b45309); }
.match-url-value { font-size: 11px; font-weight: 500; color: var(--amber-700, #b45309); word-break: break-all; text-align: center; line-height: 1.5; }
.dim-row { display: flex; align-items: center; gap: var(--space-2); }
.dim-side { font-size: 11px; font-weight: 500; color: var(--gray-400); width: 28px; text-align: center; flex-shrink: 0; }
.dim-side.active { color: var(--color-primary); font-weight: 700; }
.dim-bar-track { flex: 1; height: 8px; background: var(--gray-100); border-radius: 4px; overflow: hidden; }
.dim-bar-fill { height: 100%; background: linear-gradient(90deg, var(--indigo-500), var(--indigo-600)); border-radius: 4px; transition: width 600ms var(--ease-out-expo); }
.dim-bar-fill.right { background: linear-gradient(270deg, var(--indigo-500), var(--indigo-600)); }
.card-bottom { display: flex; align-items: center; justify-content: space-between; padding-top: var(--space-3); border-top: 1px solid var(--gray-100); }
.qr-section { display: flex; align-items: center; gap: var(--space-2); }
.qr-code { width: 56px; height: 56px; border-radius: 8px; object-fit: contain; }
.qr-hint { font-size: 10px; color: var(--gray-400); line-height: 1.4; max-width: 80px; }
.card-meta { text-align: right; }
.meta-mode { display: block; font-size: 10px; color: var(--gray-400); margin-bottom: 2px; }
.meta-url { font-size: 11px; font-weight: 600; color: var(--color-primary); }
.share-actions { display: flex; gap: var(--space-3); margin-bottom: var(--space-3); }
.share-action-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); border: 1.5px solid var(--gray-200); border-radius: 14px; background: var(--gray-0); font-size: 15px; font-weight: 600; color: var(--gray-700); cursor: pointer; transition: all 150ms var(--ease-out-quint); }
.share-action-btn:hover { border-color: var(--indigo-300); background: var(--indigo-50); }
.share-action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.share-action-btn.primary { background: var(--color-primary); color: var(--color-text-inverse); border-color: transparent; }
.share-action-btn.primary:hover { background: var(--indigo-700); }
.share-action-btn.channel { background: linear-gradient(135deg, #059669, #047857); color: #fff; border-color: transparent; }
.share-action-btn.channel:hover { box-shadow: 0 4px 12px rgba(5,150,105,0.3); }
.share-tip { text-align: center; font-size: 12px; color: var(--gray-400); margin: 0; }
.share-tip.channel-note { color: var(--green-600); font-weight: 500; }
.publish-overlay { position: fixed; inset: 0; background: rgba(19,19,31,0.5); backdrop-filter: blur(8px); display: flex; justify-content: center; align-items: center; z-index: 2000; animation: fadeIn 200ms ease; }
.publish-modal { background: var(--color-bg-elevated); border-radius: 24px; max-width: 340px; width: 100%; padding: var(--space-8); box-shadow: 0 24px 80px rgba(19,19,31,0.25); animation: modalIn 300ms var(--ease-out-expo); }
.publish-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; color: var(--gray-900); text-align: center; margin-bottom: var(--space-6); }
.publish-steps { display: flex; flex-direction: column; gap: var(--space-4); }
.publish-step { display: flex; align-items: center; gap: var(--space-3); transition: all 200ms ease; }
.publish-step.done { opacity: 0.7; }
.publish-step.failed { opacity: 1; }
.publish-step.pending { opacity: 0.4; }
.publish-step-icon { flex-shrink: 0; width: 24px; text-align: center; }
.publish-step-text { font-size: 14px; color: var(--gray-700); }
.pub-spinner { display: inline-block; width: 18px; height: 18px; border: 2px solid var(--indigo-200); border-top-color: var(--color-primary); border-radius: 50%; animation: pubSpin .8s linear infinite; }
@keyframes pubSpin { to { transform: rotate(360deg); } }
.pub-pending { font-size: 16px; color: var(--gray-300); }
.publish-success { text-align: center; }
.success-icon-big { font-size: 48px; margin-bottom: var(--space-3); animation: popIn 400ms var(--ease-out-expo); }
@keyframes popIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.publish-success-desc { font-size: 14px; color: var(--gray-500); margin: 0 0 var(--space-6); }
.publish-actions { display: flex; flex-direction: column; gap: var(--space-3); }
.publish-btn { display: block; width: 100%; padding: var(--space-3) var(--space-4); border: none; border-radius: 14px; font-size: 15px; font-weight: 600; cursor: pointer; text-align: center; text-decoration: none; transition: transform 100ms ease; }
.publish-btn:active { transform: scale(0.97); }
.publish-btn.primary { background: var(--color-primary); color: var(--color-text-inverse); }
.publish-btn.primary:hover { opacity: 0.9; }
.publish-btn.secondary { background: var(--gray-100); color: var(--gray-600); }
.publish-btn.secondary:hover { background: var(--gray-200); }
.publish-close-btn { margin-top: var(--space-4); padding: var(--space-2) var(--space-5); background: var(--gray-100); color: var(--gray-600); border: none; border-radius: 12px; font-size: 14px; cursor: pointer; }
.fade-enter-active, .fade-leave-active { transition: opacity 250ms ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-up-enter-active { transition: transform 300ms var(--ease-out-expo); }
.slide-up-leave-active { transition: transform 200ms ease-in; }
.slide-up-enter-from { transform: translateY(100%); }
.slide-up-leave-to { transform: translateY(100%); }
@media (max-width: 480px) {
  .share-modal { padding: var(--space-4) var(--space-4) var(--space-6); max-width: 100%; }
  .share-card { padding: var(--space-3); }
  .card-hero { gap: var(--space-3); }
  .card-illustration { width: 100px; max-height: 100px; }
  .card-illustration-placeholder { width: 100px; height: 67px; }
  .card-code { font-size: 28px; }
  .card-name { font-size: 16px; }
  .qr-code { width: 48px; height: 48px; }
  .share-action-btn { font-size: 14px; padding: var(--space-3); }
}
</style>
