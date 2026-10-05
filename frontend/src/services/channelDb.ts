const API_BASE = '/api'

/** 带超时的 fetch（默认 15s），防止后端挂起时前端永久 loading */
export async function postWithTimeout(url: string, options: RequestInit, timeoutMs = 15000): Promise<Response> {
  // 调用方已提供 signal（如流式请求的自定义中止逻辑）时优先使用，否则内部创建超时控制器
  const internalController = options.signal ? null : new AbortController()
  const timer = internalController ? setTimeout(() => internalController.abort(), timeoutMs) : null
  try {
    return await fetch(url, {
      ...options,
      signal: internalController ? internalController.signal : options.signal,
    })
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function post(action: string, params: Record<string, any> = {}) {
  // 自动附加 sessionId（后端校验用）
  let session: string | undefined
  try {
    const raw = localStorage.getItem('nfti_channel_session')
    if (raw) { const d = JSON.parse(raw); if (d.sessionId) session = d.sessionId }
  } catch {}
  const res = await postWithTimeout(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, session, params }),
  })
  return res.json()
}

export interface DbUser {
  id: string; tiny_id: string | null; nick: string | null
  gender: string | null; province: string | null; country: string | null
  avatar_url: string | null; created_at: string; updated_at: string
}

export async function dbSaveUser(userData: Partial<DbUser>) { return post('db-save-user', userData) }
export async function dbGetUser(tinyId: string) { return post('db-get-user', { tinyId }) }

export interface DbTestResult {
  id: string; user_id: string | null; tiny_id: string | null
  assessment_type?: string; mode: string; type_code: string; type_name: string
  scores: Record<string, number>; answers: number[]; created_at: string
}

export interface DbTestResultInput {
  assessment_type?: string; user_id?: string | null; tiny_id?: string | null; guest_id?: string | null
  mode: string; type_code: string; type_name: string
  scores: Record<string, number>; answers: number[]
}

export async function dbSaveResult(resultData: DbTestResultInput) { return post('db-save-result', resultData) }
export async function dbGetResults(userId?: string, tinyId?: string, guestId?: string) { return post('db-get-results', { userId, tinyId, guestId }) }
export async function dbGetLatestResult(userId: string) { return post('db-get-latest-result', { userId }) }

export interface DbAiChat {
  id: string; user_id: string | null; tiny_id: string | null
  messages: Array<{ role: string; content: string }>; created_at: string; updated_at: string
}

export async function dbSaveAiChat(chatData: { tiny_id?: string | null; guest_id?: string | null; messages: any[] }) { return post('db-save-ai-chat', chatData) }
export async function dbGetAiChat(tinyId: string) { return post('db-get-ai-chat', { tiny_id: tinyId }) }

export async function dbIncrementCounter(): Promise<{ success: boolean; count: number }> { return post('counter-increment') }
export async function dbGetCounter(): Promise<{ success: boolean; count: number }> { return post('counter-get') }

export interface StatsData {
  total_users: number
  total_results: number
  total_ai_chats: number
  counter: number
  page_visits: number
  nfti_distribution: Record<string, number>
  holland_distribution: Record<string, number>
}

export async function dbGetStats(): Promise<{ success: boolean; data: StatsData }> { return post('stats') }
export async function dbGetCollectionStats(): Promise<{ success: boolean; data: { nfti_counts: number[]; career_counts: number[] } }> { return post('collection-stats') }
export async function dbIncrementPageVisit(): Promise<{ success: boolean; page_visits: number }> { return post('stats-page-visit') }

export interface CrossCheckData {
  hasNfti: boolean
  hasHolland: boolean
  nftiResult?: { type_code: string; type_name: string; mode: string }
  hollandResult?: { type_code: string; type_name: string; mode: string }
}

export async function dbCrossCheck(tinyId: string): Promise<{ success: boolean; data: CrossCheckData }> {
  return post('db-cross-check', { tinyId })
}

// ─── 交叉分析缓存 ───
export interface CrossAnalysisCacheInput {
  tiny_id?: string | null
  guest_id?: string | null
  nfti_code: string
  holland_code: string
  content: string
}

export async function dbSaveCrossAnalysis(data: CrossAnalysisCacheInput) {
  return post('cross-save', data)
}

export async function dbGetCrossAnalysis(params: { tiny_id?: string | null; guest_id?: string | null; nfti_code: string; holland_code: string }) {
  return post('cross-get', params)
}

// ─── 管理面板（权限由服务端 requireAdmin 校验，fail-closed） ───

const ADMIN_CACHE_KEY = 'nfti_admin_cache'
const ADMIN_CACHE_TTL = 10 * 60 * 1000

export interface AdminCheckResult {
  isAdmin: boolean
  role: string
}

/** 当前登录 sessionId（与 channelAuth 的 STORAGE_KEY 一致） */
function currentSessionId(): string {
  try {
    const raw = localStorage.getItem('nfti_channel_session')
    if (raw) {
      const d = JSON.parse(raw)
      if (d.sessionId) return d.sessionId
    }
  } catch {}
  return ''
}

/** 读管理员缓存：命中且未过期（TTL 10 分钟）才返回。缓存按 session 隔离，且仅存肯定结果 */
export function getCachedAdmin(): AdminCheckResult | null {
  const sid = currentSessionId()
  if (!sid) return null
  try {
    const raw = localStorage.getItem(ADMIN_CACHE_KEY + '_' + sid)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || data.isAdmin !== true) return null
    if (Date.now() - data.at > ADMIN_CACHE_TTL) return null
    return { isAdmin: true, role: data.role || '' }
  } catch { return null }
}

/** 管理员身份校验（缓存仅存肯定结果且按 session 隔离；否定结果不缓存，避免瞬时 CLI 故障锁死管理员 10 分钟） */
export async function adminCheck(force = false): Promise<AdminCheckResult> {
  const sid = currentSessionId()
  if (!force && sid) {
    const cached = getCachedAdmin()
    if (cached) return cached
  }
  const data = await post('admin-check', { force })
  const result: AdminCheckResult = { isAdmin: !!data.isAdmin, role: data.role || '' }
  if (result.isAdmin && sid) {
    try { localStorage.setItem(ADMIN_CACHE_KEY + '_' + sid, JSON.stringify({ ...result, at: Date.now() })) } catch {}
  } else if (!result.isAdmin && sid) {
    try { localStorage.removeItem(ADMIN_CACHE_KEY + '_' + sid) } catch {}
  }
  return result
}

export interface TimeseriesPoint {
  date: string
  nfti_count: number
  holland_count: number
  new_users: number
}

export async function adminStatsTimeseries(days = 30): Promise<{ success: boolean; data: TimeseriesPoint[] }> {
  return post('admin-stats-timeseries', { days })
}

export interface TestRecord {
  assessment_type: string
  mode: string
  type_code: string
  type_name: string
  tiny_id: string | null
  guest_id: string | null
  nick: string | null
  created_at: string
}

export async function adminTestRecords(limit = 30): Promise<{ success: boolean; data: TestRecord[] }> {
  return post('admin-test-records', { limit })
}

export interface InviteCodeRow {
  code: string
  used: number
  multi_use: number
  browser_fingerprint: string | null
  used_at: string | null
  created_at: string
}

export async function inviteGenerate(count = 1): Promise<{ success: boolean; codes: string[]; error?: string }> {
  return post('invite-generate', { count })
}

export async function inviteList(): Promise<{ success: boolean; data: InviteCodeRow[]; error?: string }> {
  return post('invite-list')
}

export async function inviteUpdate(code: string, multiUse: boolean): Promise<{ success: boolean; error?: string }> {
  return post('invite-update', { code, multi_use: multiUse })
}

export async function inviteDelete(code: string): Promise<{ success: boolean; error?: string }> {
  return post('invite-delete', { code })
}

// ─── 默契度分享（share / match）───

export interface ShareCodeResult {
  code: string
  url: string
  expires_at: string
  recreated?: boolean
}

export async function shareCreate(resultId: string): Promise<{ success: boolean; code?: string; url?: string; expires_at?: string; error?: string }> {
  return post('share-create', { result_id: resultId })
}

export interface ShareRedeemResult {
  share: {
    code: string
    owner_nick: string | null
    assessment_type: string
    /** 是否自己的分享链接（前端提示用） */
    is_own?: boolean
    result: {
      id: string
      assessment_type: string
      type_code: string
      type_name: string
      scores: Record<string, number>
      mode: string
    }
    expires_at: string
  }
}

export async function shareRedeem(code: string): Promise<{ success: boolean; share?: ShareRedeemResult['share']; error?: string }> {
  return post('share-redeem', { code })
}

export interface MatchResultData {
  score: number
  level: string
  levelName?: string
  data: any
  ai_story: string | null
}

export interface ShareMatchResult {
  success: boolean
  cached?: boolean
  /** 配对结果持久化 ID（分享链接用） */
  match_id?: string | null
  match?: MatchResultData
  owner?: { nick: string | null; result: { id: string; type_code: string; type_name: string; scores: Record<string, number> } }
  mine?: { id: string; type_code: string; type_name: string }
  error?: string
}

export async function shareMatch(code: string, resultId: string): Promise<ShareMatchResult> {
  return post('share-match', { code, result_id: resultId })
}

// ─── 配对结果持久化分享 ───
export interface MatchShareDetail {
  id: string
  share_code: string
  score: number
  level: string
  levelName?: string
  data: any
  ai_story: string | null
  created_at: string
}

export interface MatchGetResult {
  success: boolean
  match?: MatchShareDetail
  owner?: { nick: string | null; type_code: string; type_name: string }
  mate?: { nick: string | null; type_code: string; type_name: string }
  error?: string
}

export async function matchGet(matchId: string): Promise<MatchGetResult> {
  return post('match-get', { match_id: matchId })
}

export interface MyShareCode {
  code: string
  result_id: string
  assessment_type: string
  created_at: string
  expires_at: string
  revoked: boolean
  type_code: string | null
  type_name: string | null
  match_count: number
}

export async function shareList(): Promise<{ success: boolean; data?: MyShareCode[]; error?: string }> {
  return post('share-list')
}

export async function shareRevoke(code: string): Promise<{ success: boolean; error?: string }> {
  return post('share-revoke', { code })
}

export interface MatchPairRow {
  share_code: string
  a_result_id: string
  b_result_id: string
  score: number
  level: string
  data: any
  created_at: string
  b_tiny_id: string | null
  b_nick: string | null
}

export async function sharePairs(): Promise<{ success: boolean; data?: MatchPairRow[]; error?: string }> {
  return post('share-pairs')
}

export async function matchAi(code: string, resultId: string): Promise<{ success: boolean; cached?: boolean; ai_story?: string; error?: string }> {
  return post('match-ai', { code, result_id: resultId })
}
