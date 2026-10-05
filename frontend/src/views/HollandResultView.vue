<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { HollandResult, HollandDimension } from '@/types/holland'
import { recommendNftiByHolland } from '@/assessments/holland/crossNfti'
import CrossAnalysisCard from '@/components/CrossAnalysisCard.vue'
import AICrossAnalysisCard from '@/components/AICrossAnalysisCard.vue'
import HollandShareModal from '@/components/HollandShareModal.vue'
import { getStoredSession, getGuestSession } from '@/services/channelAuth'
import { dbCrossCheck, dbGetResults, dbSaveResult, shareCreate } from '@/services/channelDb'
import { fullTypes, quickTypes } from '@/data/personalities'
import type { NftiForCross, HollandForCross } from '@/services/crossAnalysis'

// 加载职业插图
const jobIllustrations: Record<string, string> = import.meta.glob('/src/assets/Job/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function getJobIllustration(title: string): string | undefined {
  // 统一处理特殊字符（文件系统不支持 /）
  const normalized = title.replace(/\//g, '-').replace(/\s+/g, '')
  // 尝试匹配职业名.png
  const key = Object.keys(jobIllustrations).find(k => k.includes(normalized))
  if (key) return jobIllustrations[key]
  // 兜底用 auto.png
  const autoKey = Object.keys(jobIllustrations).find(k => k.includes('auto'))
  return autoKey ? jobIllustrations[autoKey] : undefined
}

const router = useRouter()
const result = ref<HollandResult | null>(null)
const loading = ref(true)
const showShare = ref(false)
const sessionId = ref('')
const isLoggedIn = ref(false)
const crossNfti = ref<{ code: string; name: string } | null>(null)
const nftiFullResult = ref<NftiForCross | null>(null)

const hollandForCross = computed<HollandForCross | null>(() => {
  if (!result.value) return null
  const code = result.value.code
  const scores = result.value.scores
  const dims = [result.value.primary, result.value.secondary, result.value.tertiary]
  const roles = dims.map(d => {
    return { dimension: d, name: d, emoji: '❓' }
  })
  return { code, primary: result.value.primary, secondary: result.value.secondary, tertiary: result.value.tertiary, scores, roles }
})

onMounted(async () => {
  try {
    const raw = sessionStorage.getItem('holland_result')
    if (raw) { result.value = JSON.parse(raw) }
    else { router.push('/'); return }
  } catch { router.push('/'); return }
  loading.value = false

  const stored = getStoredSession()
  if (stored?.sessionId) {
    isLoggedIn.value = true
    sessionId.value = stored.sessionId
    if (stored.user?.tinyId) {
      dbCrossCheck(stored.user.tinyId).then(r => {
        if (r.success && r.data.hasNfti && r.data.nftiResult) {
          crossNfti.value = { code: r.data.nftiResult.type_code, name: r.data.nftiResult.type_name }
          // 获取完整 NFTI 数据（含各维度得分）
          dbGetResults(undefined, stored.user!.tinyId).then(hist => {
            if (hist.success && hist.data) {
              const nftiResults = hist.data.filter((t: any) => t.assessment_type !== 'holland')
              if (nftiResults.length > 0) {
                const latest = nftiResults[0]
                const code = latest.type_code
                const name = latest.type_name
                const scores = latest.scores || {}
                const allTypes = [...quickTypes, ...fullTypes]
                const typeDef = allTypes.find(t => t.code === code)
                nftiFullResult.value = {
                  typeCode: code,
                  typeName: name,
                  fourLetter: typeDef?.fourLetter || null,
                  scores,
                  mode: latest.mode || 'full',
                  description: typeDef?.description || '',
                  detail: typeDef?.detail || '',
                }
              }
            }
          }).catch(() => {})
        }
      }).catch(() => {})
    }
  }
})

// ─── 高一选科推荐 ───
interface SubjectRec {
  primary: string       // 物理 or 历史
  secondary: string[]   // 4选2
  reason: string
  coverage: string      // 覆盖的专业方向
}

function getSubjectRec(code: string): SubjectRec {
  const primary = (code[0] || 'I') as string
  const secondary = code[1] || ''
  const map: Record<string, SubjectRec> = {
    R: { primary:'物理', secondary:['化学','生物'], reason:'动手实操类专业几乎全部要求物理+化学组合，生物给你留医学方向的后路。', coverage:'机械、建筑、电气、临床医学、工业设计' },
    I: { primary:'物理', secondary:['化学','生物'], reason:'研究型方向集中在理学和医学——物化生是最稳妥的"学霸套餐"，覆盖所有理工科和医学专业。', coverage:'数学、物理、计算机、临床医学、药学' },
    A: { primary:'历史', secondary:['政治','地理'], reason:'艺术和人文创意方向大多不限选科，但历史+政治+地理的传统文科组合给你最广的专业选择面。', coverage:'文学、新闻、艺术设计、影视、广告' },
    S: { primary:'历史', secondary:['政治','生物'], reason:'教育、心理、社工等方向文理兼收——历史+生物让你既能报师范也能报护理，选择面最宽。', coverage:'教育学、心理学、护理学、社会工作、人力资源管理' },
    E: { primary:'历史', secondary:['政治','地理'], reason:'管理、法学、金融对选科要求宽松——史政地组合让你可以报几乎所有文理兼收的专业，同时保留法学和政治学优势。', coverage:'工商管理、法学、金融、市场营销、公共管理' },
    C: { primary:'物理', secondary:['化学','地理'], reason:'事务型工作需要精确思维——物理打底让你能报会计和精算，化学和地理给你工程和质量管理的后路。', coverage:'会计、审计、精算、行政管理、质量管理' },
  }

  // 优先主维度匹配，其次二三维微调
  let rec: SubjectRec = map[primary] ?? map['I']!

  // 如果第二维是 A（艺术），对纯理组合微调
  if ((primary === 'R' || primary === 'I') && secondary === 'A') {
    rec = { ...rec, reason: rec.reason + ' 你的艺术倾向意味着可能也适合建筑、工业设计等"理工+美感"交叉领域。' }
  }
  // 如果第二维是 S（社会），理科底子加人文关怀
  if ((primary === 'R' || primary === 'I') && secondary === 'S') {
    rec = { ...rec, secondary: ['化学','生物'], reason: '你的研究能力配上对人的关怀——医学和教育方向都可以考虑，物化生让你两边都够得着。' }
  }

  return rec
}

const DIM_META: Record<HollandDimension, { emoji: string; name: string; color: string; bg: string }> = {
  R: { emoji: '🔧', name: '现实型', color: '#6E5F48', bg: '#F0EBE0' },
  I: { emoji: '🔬', name: '研究型', color: '#4D4031', bg: '#E4DDCD' },
  A: { emoji: '🎨', name: '艺术型', color: '#BBA888', bg: '#FBF8F3' },
  S: { emoji: '🤝', name: '社会型', color: '#D8CFBE', bg: '#F0EBE0' },
  E: { emoji: '💼', name: '企业型', color: '#9C8B6A', bg: '#E4DDCD' },
  C: { emoji: '📋', name: '常规型', color: '#524739', bg: '#D8CFBE' },
}

const sortedScores = computed(() => {
  if (!result.value) return []
  const entries = Object.entries(result.value.scores) as [HollandDimension, number][]
  return [...entries].sort((a, b) => b[1] - a[1])
})

// 霍兰德六维度理论最大值：当前 v5 题库 48 题直加总，每维 8 题 × 5 分 = 40
const MAX_HOLLAND_SCORE = 40

const crossRecommendations = computed(() => {
  if (!result.value) return []
  return recommendNftiByHolland(result.value.code).slice(0, 3)
})

const subjectRec = computed(() => {
  if (!result.value) return null
  return getSubjectRec(result.value.code)
})

const categoryColors: Record<string, string> = {
  '工程': '#6E5F48', '科技': '#9C8B6A', '医疗': '#e11d48',
  '设计': '#d97706', '艺术': '#BBA888',
  '教育': '#4D4031', '商业': '#f59e0b',
  '金融': '#6E5F48', '传媒': '#BBA888', '公共服务': '#9C8B6A',
}

function shareResult() {
  if (!result.value) return
  showShare.value = true
  // 静默尝试把默契分享链接印到分享卡片上（已登录时），失败不影响分享
  const stored = getStoredSession()
  if (!stored?.sessionId) return
  const currentCode = result.value?.code || ''
  dbGetResults(undefined, stored.user.tinyId, undefined).then(hist => {
    const list = (hist?.data || []).filter((t: any) => (t.assessment_type || '') === 'holland' && t.mode !== 'debug' && t.tiny_id)
    // 仅当存在与当前展示结果类型一致的记录才印链接
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

// ─── 默契度分享（Holland，全部走分享链接）───
const matchShareCode = ref('')
const matchShareUrl = ref('')
const matchShareLoading = ref(false)
const matchShareError = ref('')
const showMatchShare = ref(false)
const matchCopied = ref(false)

async function openMatchShare() {
  const stored = getStoredSession()
  if (!stored?.sessionId) {
    matchShareError.value = '请先登录QQ频道账号'
    showMatchShare.value = true
    return
  }
  matchShareLoading.value = true
  matchShareError.value = ''
  try {
    const currentCode = result.value?.code || ''
    let resultId = ''
    const hist = await dbGetResults(undefined, stored.user.tinyId, undefined)
    const list = (hist?.data || []).filter((t: any) => (t.assessment_type || '') === 'holland' && t.mode !== 'debug')
    // 优先用与当前展示结果一致的记录
    const matched = list.find((t: any) => t.type_code === currentCode && t.tiny_id)
    if (matched) {
      resultId = matched.id
    } else {
      // 无匹配记录（游客先测后登录 / 保存失败）→ 用当前内存结果重存绑定账号
      const careerName = result.value?.careers?.[0]?.title || currentCode
      const saved = await dbSaveResult({
        assessment_type: 'holland', tiny_id: stored.user.tinyId, mode: 'full',
        type_code: currentCode, type_name: careerName,
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

</script>

<template>
  <div class="holland-page">
    <div class="bg-blob blob-1" aria-hidden="true"></div>
    <div class="bg-blob blob-2" aria-hidden="true"></div>

    <div class="content">
      <div class="top-bar">
        <button class="back-btn" @click="router.push('/')">← 返回首页</button>
      </div>

      <div v-if="loading" class="loading-box">
        <div class="spinner"></div>
        <span>加载中...</span>
      </div>

      <template v-else-if="result">

        <!-- ===== 非认真作答提示 ===== -->
        <div v-if="result.isNonSerious" class="nonserious-box">
          <div class="nonserious-icon">🧘</div>
          <h1 class="nonserious-title">认真测评的宝子才能看到结果哦</h1>
          <p class="nonserious-desc">检测到你对所有题目选了相同的选项。花两分钟认真感受每一道题，才能发现真正的自己。</p>
          <button class="nonserious-btn" @click="router.push('/holland-test/1')">重新测评</button>
        </div>

        <!-- ===== ⭐ 你的首选职业（大图展示） ===== -->
        <section v-if="!result.isNonSerious" class="career-hero-section">
          <div class="career-hero-card">
            <div class="career-hero-label">🏆 你的首选职业</div>
            <div class="career-hero-img-wrap">
              <img v-if="result.careers[0] && getJobIllustration(result.careers[0].title)" :src="getJobIllustration(result.careers[0].title)" :alt="result.careers[0].title" class="career-hero-img" />
              <div v-else class="career-hero-img-placeholder">{{ result.careers[0]?.title?.[0] || '?' }}</div>
            </div>
            <div class="career-hero-code">霍兰德代码 <strong>{{ result.code }}</strong></div>
            <p v-if="result.ties && result.ties.length" class="career-hero-tie" style="font-size: 12px; color: #8b7355; margin-top: 4px;">
              ⚖️ {{ result.ties.join('、') }} 得分并列，按 R→I→A→S→E→C 顺序排列
            </p>
            <h1 class="career-hero-title">{{ result.careers[0]?.title || '未知职业' }}</h1>
            <p class="career-hero-reason">{{ result.careers[0]?.reason || '' }}</p>
          </div>
        </section>

        <!-- ===== 更多推荐职业 ===== -->
        <div class="career-cards" v-if="result.careers.length > 1">
          <h2 class="section-heading">更多推荐</h2>
          <div
            v-for="(c, i) in result.careers.slice(1)"
            :key="c.title"
            class="career-card"
            :style="{ '--border-color': categoryColors[c.category] || DIM_META[c.source].color }"
          >
            <img v-if="getJobIllustration(c.title)" :src="getJobIllustration(c.title)" :alt="c.title" class="career-smillu" />
            <div class="career-body">
              <h3 class="career-title">{{ c.title }}</h3>
              <p class="career-reason">{{ c.reason }}</p>
            </div>
          </div>
        </div>

        <!-- ===== 兴趣画像 ===== -->
        <div class="scores-section">
          <h2 class="section-heading">📊 兴趣画像</h2>
          <p class="section-sub">霍兰德代码 <strong>{{ result.code }}</strong></p>
          <div class="score-list">
            <div v-for="[dim, score] in sortedScores" :key="dim" class="score-row">
              <div class="score-label">
                <span class="score-emoji">{{ DIM_META[dim].emoji }}</span>
                <span class="score-name">{{ DIM_META[dim].name }}</span>
              </div>
              <div class="score-bar-wrapper">
                <div
                  class="score-bar"
                  :style="{
                    width: Math.max((score / MAX_HOLLAND_SCORE) * 100, 4) + '%',
                    background: `linear-gradient(90deg, ${DIM_META[dim].color}88, ${DIM_META[dim].color})`
                  }"
                ></div>
              </div>
              <span class="score-num">{{ score }}</span>
            </div>
          </div>
        </div>

        <!-- ===== 大学专业推荐 ===== -->
        <div class="majors-section">
          <h2 class="section-heading">🎓 适合你的大学专业</h2>
          <div class="major-cards">
            <div v-for="r in result.roles" :key="r.dimension" class="major-card-new">
              <span class="major-emoji">{{ r.emoji }}</span>
              <div class="major-dirs">
                <span v-for="m in r.suitableDirections" :key="m" class="major-dir-tag">{{ m }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ===== 高一选科推荐 ===== -->
        <div v-if="subjectRec" class="subjects-section">
          <h2 class="section-heading">📐 高一选科参考</h2>
          <p class="section-sub">适用湖南"3+1+2"新高考模式</p>
          <div class="subject-card">
            <span class="subject-value subject-primary-val">{{ subjectRec.primary }}</span>
            <span class="subject-plus">+</span>
            <span class="subject-value subject-secondary-val" v-for="s in subjectRec.secondary" :key="s">{{ s }}</span>
          </div>
          <p class="subject-reason">{{ subjectRec.reason }}</p>
          <p class="subject-coverage">
            <span class="coverage-label">覆盖方向：</span>{{ subjectRec.coverage }}
          </p>
        </div>

        <!-- ===== 交叉画像 ===== -->
        <div v-if="crossRecommendations.length > 0" class="cross-section">
          <!-- AI 深度交叉分析（两个测试都完成，且已获取完整分数） -->
          <AICrossAnalysisCard
            v-if="nftiFullResult && hollandForCross"
            :nfti="nftiFullResult"
            :holland="hollandForCross"
            :user-tiny-id="getStoredSession()?.user?.tinyId"
            :user-guest-id="getGuestSession()?.guestId"
          />
          <!-- 静态占位卡片（仅完成一个测试时提示用户） -->
          <CrossAnalysisCard
            v-else
            side="holland"
            :code="result.code"
            :cross-code="crossNfti?.code"
            :cross-name="crossNfti?.name"
          />
        </div>

        <!-- ===== 操作 ===== -->
        <div v-if="!result.isNonSerious" class="actions">
          <button class="action-btn share-btn" @click="shareResult">📤 分享结果</button>
          <button class="action-btn match-btn" :disabled="matchShareLoading" @click="openMatchShare">💞 {{ matchShareLoading ? '生成中...' : '默契分享' }}</button>
          <button class="action-btn retry-btn" @click="router.push('/holland-test/1')">🔄 重新测试</button>
        </div>

        <p class="disclaimer">🧘 测试仅供娱乐参考，请勿作为职业决策的唯一依据。你的未来，由你自己定义。</p>
      </template>
    </div>
  </div>

  <HollandShareModal
    v-if="result"
    :show="showShare"
    :result="result"
    :is-logged-in="isLoggedIn"
    :session-id="sessionId"
    :match-url="matchShareUrl"
    @close="showShare = false"
  />

  <!-- 默契分享弹窗 -->
  <div v-if="showMatchShare" class="modal-overlay" @click="showMatchShare = false">
    <div class="modal" @click.stop>
      <div class="modal-header">
        <h3>💞 你的默契分享链接</h3>
        <button class="close-btn" @click="showMatchShare = false">&times;</button>
      </div>
      <div class="modal-body">
        <p v-if="matchShareError" class="modal-error">{{ matchShareError }}</p>
        <template v-else>
          <p class="modal-tip">把这个链接发给朋友，TA 点开就能和你算默契度</p>
          <div class="match-code-box" style="font-size: 13px; word-break: break-all; line-height: 1.6;">{{ matchShareUrl }}</div>
          <p class="modal-tip">分享链接 30 天内有效，可随时在个人中心停用</p>
          <div class="modal-actions">
            <button class="modal-btn btn-primary" @click="copyMatchShare">{{ matchCopied ? '已复制 ✓' : '复制分享链接' }}</button>
            <button class="modal-btn btn-ghost" @click="showMatchShare = false">完成</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.holland-page { min-height: 100vh; position: relative; overflow: hidden; background: var(--color-bg); }
.bg-blob { position: fixed; border-radius: 50%; filter: blur(80px); opacity: 0.3; pointer-events: none; z-index: 0; }
.blob-1 { width: 400px; height: 400px; background: var(--amber-200); top: -120px; right: -80px; }
.blob-2 { width: 350px; height: 350px; background: var(--indigo-200); bottom: -80px; left: -60px; }
.content {
  position: relative; z-index: 1; max-width: 560px; margin: 0 auto;
  padding: var(--space-6) var(--space-5); display: flex; flex-direction: column; gap: var(--space-8);
}
.top-bar { margin-bottom: 0; }
.back-btn {
  font-size: 14px; font-weight: 600; color: var(--color-primary);
  background: var(--indigo-50); border: 1px solid var(--indigo-100);
  border-radius: 10px; padding: 8px 16px; cursor: pointer;
}
.loading-box { display:flex; align-items:center; justify-content:center; gap:10px; padding:80px 20px; color:var(--gray-400); }
.spinner { width:24px; height:24px; border:3px solid var(--indigo-100); border-top-color:var(--color-primary); border-radius:50%; animation:spin .8s linear infinite; }
@keyframes spin { to{transform:rotate(360deg)} }

/* ═══ 非认真作答提示 ═══ */
.nonserious-box { display:flex; flex-direction:column; align-items:center; text-align:center; padding:60px 24px 40px; gap:16px; }
.nonserious-icon { font-size:56px; }
.nonserious-title { font-family:var(--font-display); font-size:20px; font-weight:700; color:var(--gray-900); }
.nonserious-desc { font-size:14px; line-height:1.7; color:var(--gray-500); max-width:320px; }
.nonserious-btn { margin-top:8px; padding:12px 32px; font-size:15px; font-weight:600; background:var(--color-primary); color:#fff; border:none; border-radius:12px; cursor:pointer; transition:background 200ms,transform 100ms; }
.nonserious-btn:hover { background:var(--indigo-700); }
.nonserious-btn:active { transform:scale(.97); }

.section-heading { font-family:var(--font-display); font-size:18px; font-weight:700; color:var(--gray-900); margin-bottom:var(--space-2); }
.section-sub { font-size:13px; color:var(--gray-500); margin-bottom:var(--space-4); }
.section-sub strong { color:var(--color-primary); }

/* ═══ Career Hero（大图） ═══ */
.career-hero-section { }
.career-hero-card {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  padding: var(--space-6) var(--space-4);
  background: linear-gradient(135deg, var(--amber-50), var(--indigo-50));
  border: 1.5px solid var(--amber-200);
  border-radius: 24px;
}
.career-hero-label {
  font-size: 12px; font-weight: 700; letter-spacing: 0.05em;
  color: var(--amber-700); margin-bottom: var(--space-4);
}
.career-hero-img-wrap {
  width: 100%; display: flex; justify-content: center;
  margin-bottom: var(--space-4);
}
.career-hero-img {
  width: 90%; max-width: 400px; aspect-ratio: 1.5;
  border-radius: 20px; object-fit: cover;
  filter: drop-shadow(0 8px 24px rgba(0,0,0,0.08));
}
.career-hero-img-placeholder {
  width: 90%; max-width: 400px; aspect-ratio: 1.5;
  border-radius: 20px;
  background: linear-gradient(135deg, var(--indigo-100), var(--indigo-50));
  display: flex; align-items: center; justify-content: center;
  font-size: 72px; font-weight: 700; color: var(--indigo-300);
}
.career-hero-code {
  font-size: 16px; font-weight: 500; color: var(--gray-500);
  margin-bottom: var(--space-3);
}
.career-hero-code strong {
  font-family: var(--font-mono); font-size: 22px; font-weight: 800;
  color: var(--color-primary); letter-spacing: 0.08em; margin-left: 4px;
}
.career-hero-title {
  font-family: var(--font-display);
  font-size: clamp(28px, 8vw, 36px); font-weight: 700;
  color: var(--gray-900); margin: 0 0 var(--space-2); line-height: 1.2;
}
.career-hero-reason {
  font-size: 14px; line-height: 1.7; color: var(--gray-600);
  margin: 0; max-width: 400px;
}

/* ═══ Career Cards（更多推荐） ═══ */
.career-cards { display:flex; flex-direction:column; gap:var(--space-3); }
.career-card {
  display:flex; gap:var(--space-3); align-items: flex-start;
  background: var(--color-bg-elevated);
  border: 1.5px solid var(--color-border);
  border-left: 4px solid var(--border-color, #6366f1);
  border-radius: 14px;
  padding: var(--space-3);
}
.career-body { flex:1; min-width:0; }
.career-title {
  font-size: 16px; font-weight: 700; color: var(--gray-900); margin: 0 0 var(--space-1);
}
.career-reason {
  font-size: 13px; line-height: 1.6; color: var(--gray-500); margin: 0;
}
.career-smillu {
  width: 120px; height: 80px; border-radius: 12px; object-fit: cover;
  flex-shrink: 0;
}

/* ═══ Scores ═══ */
.scores-section { }
.score-list { display:flex; flex-direction:column; gap:var(--space-4); }
.score-row { display:flex; align-items:center; gap:var(--space-3); }
.score-label { display:flex; align-items:center; gap:6px; width:90px; flex-shrink:0; }
.score-emoji { font-size:18px; }
.score-name { font-size:13px; font-weight:600; color:var(--gray-700); }
.score-bar-wrapper { flex:1; height:12px; background:var(--gray-100); border-radius:6px; overflow:hidden; }
.score-bar { height:100%; border-radius:6px; min-width:4px; transition: width 800ms var(--ease-out-expo); }
.score-num { width:28px; text-align:right; font-size:13px; font-weight:600; color:var(--gray-500); font-variant-numeric:tabular-nums; }

/* ═══ Persona (compact) ═══ */
.persona-section { }
.persona-card {
  display: flex; align-items: center; gap: var(--space-3);
  background: linear-gradient(135deg, var(--amber-50), var(--indigo-50));
  border: 1.5px solid var(--amber-200); border-radius: 16px;
  padding: var(--space-4);
  flex-wrap: wrap;
}
.persona-emoji { font-size: 28px; }
.persona-name {
  font-family: var(--font-display); font-size: 18px; font-weight: 700; color: var(--gray-900);
  white-space: nowrap;
}
.persona-story {
  font-size: 13px; line-height: 1.6; color: var(--gray-600);
  flex-basis: 100%; margin: var(--space-1) 0 0;
}

/* ═══ Majors ═══ */
.major-cards { display:flex; flex-direction:column; gap:var(--space-3); }
.major-card-new {
  display:flex; align-items:center; gap:var(--space-3); padding:var(--space-3);
  background:var(--gray-0); border:1px solid var(--color-border); border-radius:14px;
}
.major-emoji { font-size:28px; flex-shrink:0; }
.major-dirs { display:flex; flex-wrap:wrap; gap:4px; }
.major-dir-tag { font-size:12px; padding:4px 10px; background:var(--indigo-50); color:var(--color-primary); border-radius:20px; font-weight:600; }

/* ═══ Subject Selection ═══ */
.subjects-section { }
.subject-card {
  display:flex; align-items:center; justify-content:center; gap:var(--space-3);
  background:var(--gray-0); border:1.5px solid var(--indigo-200); border-radius:18px;
  padding:var(--space-4) var(--space-5); margin-bottom:var(--space-4);
}
.subject-value {
  display:inline-flex; align-items:center; justify-content:center;
  padding:10px 20px; border-radius:12px; font-size:20px; font-weight:700; min-width: 60px;
}
.subject-primary-val { background:var(--color-primary); color:#fff; }
.subject-secondary-val { background:var(--indigo-100); color:var(--color-primary); }
.subject-plus {
  font-size:22px; color:var(--gray-300); font-weight:700;
}
.subject-reason {
  font-size:14px; line-height:1.7; color:var(--gray-600); margin-bottom:var(--space-3);
}
.subject-coverage {
  font-size:13px; color:var(--gray-500);
}
.coverage-label { color:var(--gray-400); }

/* ═══ Cross ═══ */
.cross-section { }

/* ═══ Actions ═══ */
.actions {
  display:flex; flex-direction:column; gap:var(--space-3);
  padding-top: var(--space-4); padding-bottom: var(--space-10);
}
.action-btn {
  display:flex; align-items:center; justify-content:center; gap:var(--space-2);
  padding:14px 20px; font-size:15px; font-weight:600; border-radius:14px;
  border:none; cursor:pointer; transition: background 200ms, transform 100ms;
}
.action-btn:active { transform: scale(.97); }
.share-btn { background:var(--color-primary); color:#fff; }
.share-btn:hover { background:var(--indigo-700); }
.match-btn { background:var(--amber-100, #fef3c7); color:var(--amber-700, #b45309); }
.match-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.retry-btn { background:var(--gray-100); color:var(--gray-600); }
.retry-btn:hover { background:var(--gray-200); }

/* ── 默契分享弹窗 ── */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(19, 19, 31, 0.5); backdrop-filter: blur(8px);
  display: flex; justify-content: center; align-items: center; z-index: 100;
  padding: 20px; animation: fadeIn 200ms ease;
}
.modal {
  background: #fff; border-radius: 18px; max-width: 420px; width: 100%;
  overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.2);
}
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--gray-100); }
.modal-header h3 { margin: 0; font-size: 16px; }
.close-btn { background: none; border: none; font-size: 22px; cursor: pointer; color: var(--gray-400); }
.modal-body { padding: 20px; }
.modal-tip { font-size: 13px; color: var(--gray-500); margin-bottom: 10px; }
.modal-error { color: var(--rose-500, #f43f5e); font-size: 14px; }
.match-code-box {
  font-family: monospace; font-size: 24px; font-weight: 700; letter-spacing: 2px;
  text-align: center; padding: 14px; border-radius: 12px;
  background: var(--amber-50, #fffbeb); color: var(--amber-700, #b45309); margin: 12px 0;
}
.modal-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.modal-btn { padding: 11px 18px; border-radius: 10px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; }
.btn-primary { background: var(--color-primary); color: #fff; }
.btn-ghost { background: var(--gray-100); color: var(--gray-600); }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.disclaimer {
  font-size: 12px; color: var(--gray-400); text-align: center;
  line-height: 1.6; margin: var(--space-2) 0 var(--space-4);
  padding: 0 var(--space-4);
}

@media (max-width: 480px) {
  .content { padding: var(--space-5) var(--space-4); gap: var(--space-6); }
  .careers-hero { padding: var(--space-4) var(--space-3); }
  .career-card { padding: var(--space-3); }
  .career-title { font-size: 15px; }
  .career-card.is-primary .career-title { font-size: 16px; }
}
</style>
