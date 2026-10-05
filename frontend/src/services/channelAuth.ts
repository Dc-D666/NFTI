import { dbSaveUser, postWithTimeout } from './channelDb'

const PROXY_BASE = import.meta.env.DEV
  ? 'http://localhost:9000'
  : import.meta.env.VITE_PROXY_BASE || '/api'

export const TARGET_GUILD_ID = '621631744026206738'
const STORAGE_KEY = 'nfti_channel_session'

export interface AuthSession {
  sessionId: string
  verificationUri: string
  qrcodeBase64: string
  expiresIn: number
}

export interface AuthResult {
  success: boolean
  status: 'authorized' | 'expired' | 'pending_authorization' | 'pending'
  user?: { tinyId: string; nickname: string }
  error?: string
}

export interface UserInfo {
  success: boolean
  data?: {
    nickname?: string; global_nickname?: string; member_name?: string
    gender?: string; province?: string; city?: string; country?: string
  }
}

export interface GuildMemberInfo {
  success: boolean
  data?: {
    nickname?: string; global_nickname?: string; member_name?: string
    gender?: string; province?: string; city?: string; country?: string
  }
}

export interface GuildInfo {
  success: boolean
  data?: {
    name?: string; guild_id?: string; guild_number?: string; member_count?: number
    guild_type?: string; avatar_url?: string; profile?: string
    create_time_human?: string; share_url?: string
  }
}

export interface GuildFeed {
  feed_id: string
  title?: string
  content_snippet?: string
  create_time?: string
  author?: string
  author_id?: string
  channel_name?: string
  comment_count?: number
  prefer_count?: number
  images?: string[]
  guild_name?: string
}

export interface GuildFeedsResult {
  success: boolean
  data?: { feeds?: GuildFeed[]; attach_info?: string }
}

export interface MyGuildsInfo {
  success: boolean
  data?: {
    created_guilds?: Array<{ guild_id: string; name?: string; guild_name?: string; role?: string }>
    managed_guilds?: Array<{ guild_id: string; name?: string; guild_name?: string; role?: string }>
    joined_guilds?: Array<{ guild_id: string; name?: string; guild_name?: string; role?: string }>
  }
}

async function post(action: string, payload: Record<string, any> = {}) {
  const body = JSON.stringify({ action, ...payload })
  const res = await postWithTimeout(PROXY_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json()
}

export async function requestLogin(): Promise<AuthSession> {
  const data = await post('login')
  if (data.error) throw new Error('登录失败: ' + data.error)
  const session: AuthSession = {
    sessionId: data.session, verificationUri: data.verification_uri,
    qrcodeBase64: data.qrcode_base64, expiresIn: data.expires_in_s,
  }
  if (!session.qrcodeBase64) throw new Error('二维码数据为空')
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId: session.sessionId, timestamp: Date.now() }))
  return session
}

/**
 * 体验任务：用 PatPlayer 签发的一次性 ticket 建立"借用"会话。
 * 复用 PatPlayer 的 QQ token（无需扫码），成功后会话持久化到本地。
 */
export async function importPatSession(ticket: string): Promise<AuthResult> {
  const data = await post('import-session', { params: { ticket } })
  const result: AuthResult = {
    success: !!data.success,
    status: data.success ? 'authorized' : 'pending_authorization',
    user: data.user ? { tinyId: data.user.tiny_id || '', nickname: data.user.nickname || '' } : undefined,
    error: data.error,
  }
  if (result.status === 'authorized' && result.user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sessionId: data.session, timestamp: Date.now(), user: result.user, authorized: true,
    }))
    dbSaveUser({ tiny_id: result.user.tinyId, nick: result.user.nickname }).catch(() => {})
  }
  return result
}

export async function pollToken(sessionId: string): Promise<AuthResult> {
  const data = await post('poll-token', { session: sessionId })
  const userData = data.user ? { tinyId: data.user.tiny_id || '', nickname: data.user.nickname || '' } : undefined
  const result: AuthResult = {
    success: data.success, status: data.status || (data.data && data.data.status) || 'pending',
    user: userData, error: data.error,
  }
  if (result.status === 'authorized' && result.user) {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, user: result.user, authorized: true }))
    dbSaveUser({ tiny_id: result.user.tinyId, nick: result.user.nickname }).catch(() => {})
  }
  return result
}

export async function getUserInfo(sessionId: string): Promise<UserInfo> {
  return post('get-my-info', { session: sessionId })
}

export async function getGuildMemberInfo(sessionId: string): Promise<GuildMemberInfo> {
  return post('get-my-info', { session: sessionId, params: { guildId: TARGET_GUILD_ID } })
}

export async function getGuildInfo(sessionId: string): Promise<GuildInfo> {
  return post('get-guild-info', { session: sessionId, params: { guildId: TARGET_GUILD_ID } })
}

export async function getMyGuilds(sessionId: string): Promise<MyGuildsInfo> {
  return post('get-my-join-guild-info', { session: sessionId })
}

export async function checkUserInGuild(sessionId: string): Promise<boolean> {
  try {
    const data = await post('get-my-join-guild-info', { session: sessionId })
    if (!data.success || !data.data) return false
    const allGuilds = [
      ...(data.data.joined_guilds || []), ...(data.data.managed_guilds || []), ...(data.data.created_guilds || []),
    ]
    return allGuilds.some((g: any) => g.guild_id === TARGET_GUILD_ID)
  } catch { return false }
}

export async function checkSession(sessionId: string): Promise<boolean> {
  const data = await post('session-status', { session: sessionId })
  return data.valid === true
}

export function getStoredSession(): { sessionId: string; user: { tinyId: string; nickname: string } } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data.sessionId || !data.user) return null
    return { sessionId: data.sessionId, user: { tinyId: data.user.tinyId || data.user.tiny_id || '', nickname: data.user.nickname || '' } }
  } catch { return null }
}

export function clearSession() { localStorage.removeItem(STORAGE_KEY); clearPendingOAuthSession() }

// ─── 默契度分享：待处理口令（未登录点开分享链接时暂存，登录后自动继续）───
const PENDING_MATCH_CODE_KEY = 'nfti_pending_match_code'

export function savePendingMatchCode(code: string) {
  try { localStorage.setItem(PENDING_MATCH_CODE_KEY, String(code).toUpperCase()) } catch { /* ignore */ }
}

export function getPendingMatchCode(): string | null {
  try {
    const code = localStorage.getItem(PENDING_MATCH_CODE_KEY)
    return code || null
  } catch { return null }
}

export function clearPendingMatchCode() {
  try { localStorage.removeItem(PENDING_MATCH_CODE_KEY) } catch { /* ignore */ }
}

// ─── OAuth 回调恢复（手机端 connect.qq.com 授权后跳回）───
const PENDING_OAUTH_KEY = 'nfti_pending_oauth'

export function savePendingOAuthSession(sessionId: string) {
  localStorage.setItem(PENDING_OAUTH_KEY, JSON.stringify({ sessionId, timestamp: Date.now() }))
}

export function getPendingOAuthSession(): { sessionId: string } | null {
  try {
    const raw = localStorage.getItem(PENDING_OAUTH_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data.sessionId) return null
    // 超过 300 秒视为过期（覆盖 OAuth 授权耗时）
    if (Date.now() - data.timestamp > 300000) {
      localStorage.removeItem(PENDING_OAUTH_KEY)
      return null
    }
    return { sessionId: data.sessionId }
  } catch { return null }
}

export function clearPendingOAuthSession() {
  localStorage.removeItem(PENDING_OAUTH_KEY)
}

// ─── 游客系统 ───
const GUEST_KEY = 'nfti_guest'

export function getGuestId(): string {
  let id = localStorage.getItem(GUEST_KEY)
  if (!id) {
    id = 'guest_' + crypto.randomUUID()
    localStorage.setItem(GUEST_KEY, id)
  }
  return id
}

export function isGuest(): boolean {
  return !!localStorage.getItem(GUEST_KEY)
}

export function getGuestSession(): { guestId: string; isGuest: true } | null {
  const id = localStorage.getItem(GUEST_KEY)
  return id ? { guestId: id, isGuest: true } : null
}

export function clearGuest() { localStorage.removeItem(GUEST_KEY) }

// ─── 内测版邀请码系统（仅解锁网站，不登录账号）───
const BETA_UNLOCK_KEY = 'nfti_beta_unlocked'
const FINGERPRINT_KEY = 'nfti_fingerprint'

/** 获取/生成设备指纹（绑定邀请码用） */
export function getFingerprint(): string {
  let fp = localStorage.getItem(FINGERPRINT_KEY)
  if (!fp) {
    const raw = navigator.userAgent + navigator.language + screen.width + screen.height
    let hash = 0
    for (let i = 0; i < raw.length; i++) { hash = ((hash << 5) - hash) + raw.charCodeAt(i); hash |= 0 }
    fp = 'fp_' + Math.abs(hash).toString(36) + '_' + crypto.randomUUID().slice(0, 8)
    localStorage.setItem(FINGERPRINT_KEY, fp)
  }
  return fp
}

/** 使用邀请码解锁网站（不再自动登录） */
export async function redeemInviteCode(code: string): Promise<{ success: boolean; error?: string }> {
  const fingerprint = getFingerprint()
  const data = await post('invite-redeem', { params: { code, fingerprint } })
  if (data.success) {
    localStorage.setItem(BETA_UNLOCK_KEY, 'true')
    return { success: true }
  }
  return { success: false, error: data.error || '兑换失败' }
}

/** 检查网站是否已通过邀请码解锁 */
export function isBetaUnlocked(): boolean {
  return localStorage.getItem(BETA_UNLOCK_KEY) === 'true'
}

/** 清除解锁状态 */
export function clearBetaUnlock() { localStorage.removeItem(BETA_UNLOCK_KEY) }

// 兼容旧版 beta session（不再使用，保留引用避免编译报错）
export function getBetaSession(): null { return null }
export async function verifyBetaSession(): Promise<boolean> { return false }
export function clearBetaSession() { localStorage.removeItem(BETA_UNLOCK_KEY) }

// ─── 模式管理 ───
const MODE_KEY = 'nfti_app_mode'

export type AppMode = 'beta' | 'production'

export function getAppMode(): AppMode {
  // 优先 localStorage，其次 VITE 环境变量
  const stored = localStorage.getItem(MODE_KEY) as AppMode | null
  if (stored === 'beta' || stored === 'production') return stored
  return (import.meta.env.VITE_APP_MODE as AppMode) || 'production'
}

export function setAppMode(mode: AppMode) {
  localStorage.setItem(MODE_KEY, mode)
}

/** 判断当前是否已登录（仅 QQ 频道扫码登录，邀请码解锁不算） */
export function isLoggedIn(): boolean {
  return !!getStoredSession()
}

export async function serverLogout(sessionId: string) {
  try { await post('logout', { session: sessionId }) } catch (_) {}
}

export async function getGuildFeeds(sessionId: string, count = 10): Promise<GuildFeedsResult> {
  return post('get-guild-feeds', { session: sessionId, count })
}

export async function getMyFeeds(sessionId: string, count = 10): Promise<GuildFeedsResult> {
  return post('get-my-feeds', { session: sessionId, count })
}

export async function getHotFeeds(sessionId: string, count = 5): Promise<GuildFeedsResult> {
  return post('get-hot-feeds', { session: sessionId, count })
}

export async function getFeedShareUrl(sessionId: string, feedId: string): Promise<{ success: boolean; data?: { share_url?: string; url?: string }; error?: string }> {
  return post('get-feed-share-url', { session: sessionId, feedId })
}

export async function publishShare(sessionId: string, content: string, imageBase64?: string): Promise<{ success: boolean; data?: any; error?: string; feedUrl?: string }> {
  return post('publish-feed', { session: sessionId, content, imageBase64 })
}
