<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { toCanvas } from 'dom-to-image-more'
import type { HollandResult, HollandRole } from '@/types/holland'
import qrCodeImg from '@/assets/qrcodev2.png'
import { publishShare } from '@/services/channelAuth'

// 加载职业插图
const jobIllustrations: Record<string, string> = import.meta.glob('/src/assets/Job/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function getJobIllustration(title: string): string | undefined {
  // 统一处理特殊字符（文件系统不支持 /）
  const normalized = title.replace(/\//g, '-').replace(/\s+/g, '')
  const key = Object.keys(jobIllustrations).find(k => k.includes(normalized))
  if (key) return jobIllustrations[key]
  const autoKey = Object.keys(jobIllustrations).find(k => k.includes('auto'))
  return autoKey ? jobIllustrations[autoKey] : undefined
}

const props = defineProps<{
  show: boolean
  result: HollandResult
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

const topCareers = computed(() => props.result.careers.slice(0, 5))

const shareText = computed(() => {
  const r = props.result
  const careers = r.careers.slice(0, 3).map(c => c.title).join('、')
  return `我在【南方中学职业测评】里测出了【霍兰德 ${r.code}】\n🎯 推荐方向：${careers}\n\n你也来测测你的职业底色 → https://nfti.weaxi.cn`
})

// 记录最近一次生成的卡片是否已含口令（用于"口令晚到补生成"判断）
const renderedWithUrl = ref(false)

async function generateCardImage() {
  if (!shareCardRef.value) return
  isGenerating.value = true
  try {
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
  link.download = 'HOLLAND_' + props.result.code + '_' + Date.now() + '.png'
  link.href = savedImageUrl.value
  link.click()
}

watch(() => props.show, (show) => {
  if (show) { savedImageUrl.value = null; nextTick(() => { setTimeout(() => generateCardImage(), 400) }) }
})

// 口令异步加载竞态：口令到达后无条件补一次生成（renderedWithCode 标记）
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

const dimNames: Record<string, string> = {
  R: '实操', I: '研究', A: '创意', S: '助人', E: '领导', C: '规范'
}

const dimColors: Record<string, string> = {
  R: '#6E5F48', I: '#4D4031', A: '#BBA888', S: '#D8CFBE', E: '#9C8B6A', C: '#524739'
}

// 职业分类配色：统一转为 rgba（dom-to-image 的 SVG foreignObject 对 8 位 hex 解析不稳定，
// 会导致背景色丢失 / 文字基线重叠）
const CATEGORY_COLORS: Record<string, string> = {
  '工程': '#6E5F48', '科技': '#9C8B6A', '医疗': '#e11d48', '设计': '#d97706',
  '艺术': '#BBA888', '教育': '#4D4031', '商业': '#f59e0b', '金融': '#6E5F48',
  '传媒': '#BBA888',
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function careerTagStyle(category: string): { background: string; color: string } {
  const c = CATEGORY_COLORS[category] || '#9C8B6A'
  return { background: hexToRgba(c, 0.13), color: c }
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
              <!-- Brand bar -->
              <div class="card-brand-bar">
                <span class="brand-mark">HOLLAND</span>
                <span class="brand-divider"></span>
                <span class="brand-tag">南方中学 · 职业测评</span>
              </div>

              <!-- Hero: 首选职业大图 -->
              <div class="career-hero-share">
                <img
                  v-if="getJobIllustration(result.careers[0]?.title || '')"
                  :src="getJobIllustration(result.careers[0]?.title || '')"
                  :alt="result.careers[0]?.title || ''"
                  class="career-hero-img-share"
                />
                <div v-else class="career-hero-img-placeholder-share">
                  {{ result.careers[0]?.title?.[0] || '?' }}
                </div>
                <div class="career-hero-label-share">{{ result.careers[0]?.title || '' }}</div>
              </div>

              <!-- Code -->
              <div class="card-code-row">
                <span class="card-code">{{ result.code }}</span>
              </div>

              <!-- Dimension scores -->
              <div class="card-dims">
                <div v-for="dim in ['R','I','A','S','E','C']" :key="dim" class="dim-row">
                  <span class="dim-label" :style="{ color: dimColors[dim] }">
                    {{ dim }} {{ dimNames[dim] }}
                  </span>
                  <div class="dim-bar-track">
                    <div class="dim-bar-fill" :style="{ width: Math.min(((result.scores[dim as keyof typeof result.scores] || 0) / 40) * 100, 100) + '%', background: dimColors[dim] }"></div>
                  </div>
                  <span class="dim-score">{{ result.scores[dim as keyof typeof result.scores] || 0 }}</span>
                </div>
              </div>

              <!-- Top careers -->
              <div class="card-careers">
                <div class="careers-title">🎯 推荐职业方向</div>
                <div v-for="c in topCareers" :key="c.title" class="career-row">
                  <span class="career-category-tag" :style="careerTagStyle(c.category)">
                    {{ c.category }}
                  </span>
                  <span class="career-title">{{ c.title }}</span>
                </div>
              </div>

              <!-- Bottom -->
              <div v-if="matchUrl" class="card-match-url">
                <span class="match-url-label">💞 默契分享</span>
                <span class="match-url-value">{{ matchUrl }}</span>
              </div>
              <div class="card-bottom">
                <div class="qr-section">
                  <img :src="qrCodeImg" alt="扫码测试" class="qr-code" />
                  <span class="qr-hint">扫码测测你的职业底色</span>
                </div>
                <div class="card-meta">
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

            <!-- Publish overlay -->
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
.share-card { background: #ffffff; border: 1px solid var(--gray-200); border-radius: 16px; padding: var(--space-4); margin-bottom: var(--space-5); position: relative; font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif; line-height: 1.5; color: var(--gray-900); }
.card-brand-bar { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-4); }
.brand-mark { font-family: 'Courier New', monospace; font-size: 13px; font-weight: 700; color: var(--color-primary); letter-spacing: 0.1em; }
.brand-divider { width: 1px; height: 12px; background: var(--gray-300); }
.brand-tag { font-size: 12px; color: var(--gray-400); }

.career-hero-share { display: flex; flex-direction: column; align-items: center; margin-bottom: var(--space-4); }
.career-hero-img-share { width: 90%; max-width: 300px; height: auto; aspect-ratio: 1.5; object-fit: cover; border-radius: 16px; background: var(--gray-50); margin: 0 auto var(--space-3); display: block; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
.career-hero-img-placeholder-share { width: 90%; max-width: 300px; aspect-ratio: 1.5; border-radius: 16px; background: linear-gradient(135deg, var(--indigo-100), var(--indigo-50)); display: flex; align-items: center; justify-content: center; font-size: 48px; font-weight: 700; color: var(--indigo-300); margin: 0 auto var(--space-3); }
.career-hero-label-share { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 20px; font-weight: 700; color: var(--gray-900); text-align: center; }

.card-code-row { margin-bottom: var(--space-3); }
.card-code { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 36px; font-weight: 800; color: var(--gray-900); letter-spacing: 0.12em; }
.card-code-row .card-code { display: inline-block; padding: 0 8px; letter-spacing: 0.18em; }

.card-dims { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--space-3); padding-bottom: var(--space-3); border-bottom: 1px solid var(--gray-100); }
.card-match-url { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px; background: var(--amber-50, #fffbeb); border: 1px dashed var(--amber-400, #fbbf24); border-radius: 10px; margin-bottom: var(--space-3); }
.match-url-label { font-size: 11px; font-weight: 600; color: var(--amber-700, #b45309); }
.match-url-value { font-size: 11px; font-weight: 500; color: var(--amber-700, #b45309); word-break: break-all; text-align: center; line-height: 1.5; }
.dim-row { display: flex; align-items: center; gap: var(--space-2); }
.dim-label { font-size: 11px; font-weight: 700; width: 70px; flex-shrink: 0; }
.dim-bar-track { flex: 1; height: 8px; background: var(--gray-100); border-radius: 4px; overflow: hidden; }
.dim-bar-fill { height: 100%; border-radius: 4px; transition: width 600ms var(--ease-out-expo); }
.dim-score { font-size: 11px; font-weight: 700; color: var(--gray-400); width: 24px; text-align: right; }

.card-persona { padding: var(--space-3); background: linear-gradient(135deg, #fef3c7, #fef9c3); border: 1px solid #fde68a; border-radius: 12px; margin-bottom: var(--space-3); }
.persona-header { display: flex; align-items: center; gap: var(--space-1); margin-bottom: var(--space-1); }
.persona-emoji { font-size: 18px; }
.persona-label { font-size: 13px; font-weight: 700; color: #92400e; }
.persona-story { font-size: 12px; line-height: 1.7; color: #78350f; margin: 0; }

.card-careers { margin-bottom: var(--space-3); }
.careers-title { font-size: 12px; font-weight: 700; color: var(--gray-600); margin-bottom: var(--space-2); letter-spacing: 0.04em; line-height: 1.5; }
.career-row { display: flex; align-items: center; gap: var(--space-2); padding: 3px 0; line-height: 1.5; min-height: 22px; }
.career-category-tag { font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; white-space: nowrap; line-height: 1.4; flex-shrink: 0; }
.career-title { font-size: 13px; color: var(--gray-700); line-height: 1.5; min-width: 0; overflow-wrap: break-word; }

.card-bottom { display: flex; align-items: center; justify-content: space-between; padding-top: var(--space-3); border-top: 1px solid var(--gray-100); }
.qr-section { display: flex; align-items: center; gap: var(--space-2); }
.qr-code { width: 56px; height: 56px; border-radius: 8px; object-fit: contain; }
.qr-hint { font-size: 10px; color: var(--gray-400); line-height: 1.4; max-width: 80px; }
.card-meta { text-align: right; }
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
  .qr-code { width: 48px; height: 48px; }
  .share-action-btn { font-size: 14px; padding: var(--space-3); }
}
</style>
