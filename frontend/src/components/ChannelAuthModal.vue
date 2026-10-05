<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { requestLogin, pollToken, getUserInfo, getStoredSession, clearSession, type AuthSession } from '@/services/channelAuth'
import { getAppMode, redeemInviteCode, isBetaUnlocked, savePendingOAuthSession, getPendingOAuthSession, clearPendingOAuthSession } from '@/services/channelAuth'

const emit = defineEmits<{ (e: 'success', nickname: string): void; (e: 'unlocked'): void; (e: 'close'): void; (e: 'guest'): void }>()

// 已解锁 → 直接展示 QQ 登录；未解锁 → 展示邀请码输入
// 当前开放正式版（无内测）：强制不进邀请码流程。恢复内测时取消下行注释
// const showInvite = computed(() => getAppMode() === 'beta' && !isBetaUnlocked())
const showInvite = computed(() => false)

// ─── 正式版：QQ 扫码/链接登录 ───
const session = ref<AuthSession | null>(null)
const status = ref<'loading' | 'polling' | 'fetching' | 'success' | 'expired' | 'error'>('loading')
const errorMsg = ref('')
const nickname = ref('')
const isPolling = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null
let expireTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => { if (!showInvite.value) startLogin() })
onUnmounted(() => stopPolling())

async function startLogin() {
  // 如果已有 OAuth 恢复在进行，跳过当前登录（手机端 connect.qq.com 回调场景）
  if (getPendingOAuthSession()) {
    status.value = 'polling'; isPolling.value = false
    const sid = getPendingOAuthSession()!.sessionId
    // 占位 session：恢复阶段无二维码/链接数据，但保证 UI 渲染「等待授权」而非空白
    session.value = { sessionId: sid, verificationUri: '', qrcodeBase64: '', expiresIn: 120 }
    pollTimer = setInterval(() => { if (!isPolling.value) doPoll(sid) }, 3000)
    return
  }
  status.value = 'loading'; errorMsg.value = ''
  pollErrorCount = 0
  try {
    session.value = await requestLogin()
    // 保存 sessionId 用于 OAuth 回调恢复（手机浏览器跳 connect.qq.com 后跳回）
    savePendingOAuthSession(session.value.sessionId)
    status.value = 'polling'; isPolling.value = false
    pollTimer = setInterval(() => { if (session.value && !isPolling.value) doPoll(session.value.sessionId) }, 3000)
    expireTimer = setTimeout(() => { if (status.value === 'polling') { status.value = 'expired'; stopPolling() } }, (session.value?.expiresIn || 120) * 1000)
  } catch (err: any) {
    status.value = 'error'; errorMsg.value = err.message || '获取二维码失败'
  }
}

let pollErrorCount = 0

async function doPoll(sessionId: string) {
  if (isPolling.value) return; isPolling.value = true
  try {
    const result = await pollToken(sessionId)
    pollErrorCount = 0 // 成功响应即重置错误计数（pending 也算正常响应）
    if (result.status === 'authorized' && result.user) {
      stopPolling(); clearPendingOAuthSession(); status.value = 'fetching'
      try {
        const userInfo = await getUserInfo(sessionId)
        const tinyPart = (result.user.tinyId || '').slice(0, 6)
        const nick = userInfo.data?.nickname || result.user.nickname || (tinyPart ? '用户' + tinyPart : '同学')
        status.value = 'success'; nickname.value = nick; emit('success', nick)
        setTimeout(() => emit('close'), 2000)
      } catch {
        status.value = 'success'; nickname.value = result.user.nickname; emit('success', result.user.nickname)
        setTimeout(() => emit('close'), 2000)
      }
    } else if (result.status === 'expired') { stopPolling(); status.value = 'expired' }
  } catch (e) {
    // 连续 3 次请求失败说明二维码/后端已不可用，停止轮询避免永久等待
    pollErrorCount++
    console.warn('[ChannelAuth] poll-token error:', e)
    if (pollErrorCount >= 3) {
      stopPolling(); status.value = 'error'; errorMsg.value = '连接服务器失败，请点击刷新重试'
    }
  } finally { isPolling.value = false }
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  if (expireTimer) { clearTimeout(expireTimer); expireTimer = null }
}

function handleRefresh() { stopPolling(); clearPendingOAuthSession(); startLogin() }
function handleClose() { stopPolling(); clearPendingOAuthSession(); emit('close') }
function handleGuest() { stopPolling(); emit('guest') }
function copyLink() {
  if (session.value?.verificationUri) { navigator.clipboard.writeText(session.value.verificationUri); alert('链接已复制到剪贴板') }
}

// ─── 内测版：邀请码登录 ───
const inviteCode = ref('')
const betaStatus = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const betaError = ref('')

async function handleBetaLogin() {
  const code = inviteCode.value.trim()
  if (!code) { betaError.value = '请输入邀请码'; return }
  betaStatus.value = 'loading'; betaError.value = ''
  try {
    const result = await redeemInviteCode(code)
    if (result.success) {
      betaStatus.value = 'success'
      emit('unlocked')
      setTimeout(() => emit('close'), 1500)
    } else {
      betaStatus.value = 'error'; betaError.value = result.error || '兑换失败'
    }
  } catch {
    betaStatus.value = 'error'; betaError.value = '网络错误，请重试'
  }
}
</script>

<template>
  <div class="modal-overlay" @click="showInvite ? null : handleClose">
    <div class="modal" @click.stop>
      <div class="modal-header">
        <h3>{{ showInvite ? '解锁网站' : '登录QQ频道' }}</h3>
        <button v-if="!showInvite" class="close-btn" @click="handleClose">&times;</button>
      </div>
      <div class="modal-body">

        <!-- ═══ 内测版：邀请码登录 ═══ -->
        <template v-if="showInvite">
          <div class="beta-banner">内测版</div>
          <p class="beta-desc">请输入邀请码解锁全部功能</p>

          <div class="invite-input-group">
            <input
              v-model="inviteCode"
              class="invite-input"
              type="text"
              placeholder="输入邀请码"
              :disabled="betaStatus === 'loading' || betaStatus === 'success'"
              @keyup.enter="handleBetaLogin"
            />
            <button
              class="beta-login-btn"
              :disabled="betaStatus === 'loading' || betaStatus === 'success'"
              @click="handleBetaLogin"
            >
              {{ betaStatus === 'loading' ? '验证中...' : '解锁' }}
            </button>
          </div>

          <p v-if="betaError" class="beta-error">{{ betaError }}</p>
          <div v-if="betaStatus === 'success'" class="beta-success">✓ 登录成功！</div>
        </template>

        <!-- ═══ 正式版：QQ 登录 ═══ -->
        <template v-else>
          <div v-if="status === 'loading'" class="status-box">
            <div class="spinner"></div>
            <p>正在获取二维码...</p>
          </div>

          <div v-else-if="status === 'polling' && session" class="qrcode-box">
            <div class="auth-purpose">
              <p>授权后你可以：</p>
              <ul>
                <li>将测试结果一键分享至南方中学频道</li>
                <li>查看频道内的热门帖子</li>
                <li>使用方小楠问答功能</li>
              </ul>
            </div>

            <a v-if="session.verificationUri" :href="session.verificationUri" target="_blank" class="primary-link-btn">
              <svg class="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              <span>打开授权链接</span>
              <svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </a>
            <button v-else class="primary-link-btn" @click="copyLink">
              <svg class="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <span>复制授权链接</span>
            </button>

            <p class="primary-hint">推荐在手机或电脑浏览器中打开<br>使用QQ账号授权登录</p>

            <details class="qrcode-details">
              <summary class="qrcode-summary">也可以用QQ扫码登录</summary>
              <img v-if="session.qrcodeBase64" :src="'data:image/png;base64,' + session.qrcodeBase64" alt="QQ频道登录二维码" class="qrcode-img" />
              <div v-else class="qrcode-placeholder"><p>二维码加载中...</p></div>
            </details>

            <div class="polling-indicator"><span class="dot"></span>等待授权...</div>
            <div class="guest-divider"><span>或</span></div>
            <button class="guest-btn" @click="handleGuest">🧑‍💻 游客登录（无需扫码）</button>
          </div>

          <div v-else-if="status === 'fetching'" class="status-box">
            <div class="spinner"></div>
            <p>登录成功，正在获取用户信息...</p>
          </div>

          <div v-else-if="status === 'success'" class="status-box success">
            <div class="success-icon">✓</div>
            <p>授权成功！</p>
            <p class="nickname">欢迎，{{ nickname }}</p>
          </div>

          <div v-else-if="status === 'expired'" class="status-box">
            <p>二维码已过期</p>
            <button class="refresh-btn" @click="handleRefresh">刷新二维码</button>
          </div>

          <div v-else-if="status === 'error'" class="status-box">
            <p class="error-text">{{ errorMsg }}</p>
            <button class="refresh-btn" @click="handleRefresh">重试</button>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(19, 19, 31, 0.5); backdrop-filter: blur(8px);
  display: flex; justify-content: center; align-items: center; z-index: 100;
  padding: var(--space-5); animation: fadeIn 200ms ease;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.modal {
  background: var(--color-bg-elevated); border-radius: 24px; max-width: 360px; width: 100%;
  box-shadow: 0 24px 80px rgba(19, 19, 31, 0.2); animation: modalIn 300ms var(--ease-out-expo); overflow: hidden;
}
@keyframes modalIn { from { opacity: 0; transform: scale(0.92) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
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
.modal-body { padding: var(--space-4) var(--space-6) var(--space-6); display: flex; flex-direction: column; align-items: center; }

/* ─── 内测版 ─── */
.beta-banner {
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: #fff; background: linear-gradient(135deg, #f59e0b, #d97706);
  padding: 3px 12px; border-radius: 6px; margin-bottom: var(--space-3);
}
.beta-desc { font-size: 14px; color: var(--gray-600); margin: 0 0 var(--space-4); text-align: center; }
.invite-input-group { display: flex; gap: var(--space-2); width: 100%; }
.invite-input {
  flex: 1; padding: 12px 16px; font-size: 14px; font-family: var(--font-mono, monospace);
  border: 1.5px solid var(--gray-300); border-radius: 12px; outline: none;
  background: var(--gray-0); color: var(--gray-800); transition: border-color 150ms ease;
}
.invite-input:focus { border-color: var(--color-primary); }
.invite-input:disabled { opacity: 0.5; }
.beta-login-btn {
  padding: 12px 20px; font-size: 14px; font-weight: 700; white-space: nowrap;
  color: #fff; background: var(--color-primary); border: none; border-radius: 12px;
  cursor: pointer; transition: opacity 150ms ease, transform 100ms;
}
.beta-login-btn:hover { opacity: 0.9; }
.beta-login-btn:active { transform: scale(0.97); }
.beta-login-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.beta-error { font-size: 13px; color: var(--rose-600); margin: var(--space-2) 0 0; }
.beta-success { font-size: 14px; color: var(--green-600); font-weight: 600; margin: var(--space-2) 0 0; }

/* ─── 正式版 ─── */
.status-box { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); text-align: center; }
.status-box p { font-size: 14px; color: var(--gray-600); margin: 0; }
.spinner { width: 40px; height: 40px; border: 3px solid var(--indigo-100); border-top-color: var(--color-primary); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.qrcode-box { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); width: 100%; }
.auth-purpose {
  width: 100%; text-align: left; background: var(--indigo-50); border: 1px solid var(--indigo-100);
  border-radius: 12px; padding: var(--space-3) var(--space-4); margin-bottom: var(--space-2);
}
.auth-purpose p { font-size: 13px; font-weight: 600; color: var(--indigo-700); margin: 0 0 var(--space-2) 0; }
.auth-purpose ul { margin: 0; padding-left: var(--space-4); list-style-type: none; }
.auth-purpose li { font-size: 12px; color: var(--indigo-600); line-height: 1.8; position: relative; padding-left: var(--space-3); }
.auth-purpose li::before { content: '✓'; position: absolute; left: 0; color: var(--indigo-400); font-weight: 700; }
.qrcode-hint { font-size: 13px; color: var(--gray-500); margin: 0; }
.primary-link-btn {
  display: flex; align-items: center; justify-content: center; gap: var(--space-2);
  width: 100%; padding: 14px 20px; font-size: 15px; font-weight: 700;
  color: #fff; background: var(--color-primary);
  border: none; border-radius: 14px; cursor: pointer; text-decoration: none;
  transition: transform 100ms ease, opacity 150ms ease;
}
.primary-link-btn:hover { opacity: 0.92; }
.primary-link-btn:active { transform: scale(0.97); }
.link-icon { width: 18px; height: 18px; flex-shrink: 0; }
.arrow-icon { width: 16px; height: 16px; flex-shrink: 0; margin-left: auto; }
.primary-hint { font-size: 12px; color: var(--gray-400); margin: 0; text-align: center; line-height: 1.6; }
.qrcode-details { width: 100%; }
.qrcode-summary {
  font-size: 13px; color: var(--gray-500); text-align: center; cursor: pointer;
  padding: var(--space-2); border-radius: 8px; transition: background 150ms ease;
  list-style: none; user-select: none;
}
.qrcode-summary:hover { background: var(--gray-100); }
.qrcode-summary::-webkit-details-marker { display: none; }
.qrcode-img { width: 160px; height: 160px; border-radius: 12px; border: 1px solid var(--color-border); display: block; margin: var(--space-2) auto 0; }
.qrcode-placeholder { width: 200px; height: 200px; border-radius: 12px; border: 1px solid var(--color-border); background: var(--gray-50); display: flex; align-items: center; justify-content: center; }
.polling-indicator { display: flex; align-items: center; gap: var(--space-2); font-size: 13px; color: var(--gray-400); margin-top: var(--space-2); }
.dot { width: 8px; height: 8px; background: var(--color-primary); border-radius: 50%; animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.success { color: var(--green-600); }
.success-icon { width: 48px; height: 48px; border-radius: 50%; background: var(--green-100); color: var(--green-600); display: flex; align-items: center; justify-content: center; font-size: 24px; }
.nickname { font-family: var(--font-display); font-size: 18px; font-weight: 700; color: var(--gray-900); }
.error-text { color: var(--rose-600); }
.refresh-btn { background: var(--color-primary); color: var(--color-text-inverse); border: none; border-radius: 12px; padding: var(--space-3) var(--space-5); font-size: 15px; font-weight: 600; cursor: pointer; transition: transform 100ms ease, opacity 150ms ease; }
.refresh-btn:hover { opacity: 0.9; }
.refresh-btn:active { transform: scale(0.97); }
.guest-divider { width:100%; display:flex; align-items:center; gap:var(--space-3); margin:var(--space-3) 0; }
.guest-divider::before, .guest-divider::after { content:''; flex:1; height:1px; background:var(--gray-200); }
.guest-divider span { font-size:12px; color:var(--gray-400); white-space:nowrap; }
.guest-btn {
  width:100%; background:var(--gray-100); color:var(--gray-700);
  border: 1px solid var(--gray-300); border-radius:12px;
  padding: var(--space-3) var(--space-4); font-size:14px; font-weight:600;
  cursor:pointer; transition: background 150ms ease, transform 100ms;
}
.guest-btn:hover { background:var(--gray-200); }
.guest-btn:active { transform: scale(.97); }
</style>
