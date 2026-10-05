const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { runCli, runCliWithStdin, runCliCaptureRaw, extractOwnTinyId, clearWindowsCredential, saveBase64Image } = require('./proxy')
const { computeMatch, generateShareCode, levelNameOf } = require('./match')

// 安全：CORS 白名单（仅允许特定来源跨域）
const ALLOWED_ORIGINS = [
  'https://nfti.weaxi.cn',
  'http://localhost:5173',
  'http://localhost:9000',
]
function getAllowOrigin(req) {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin
  return 'https://nfti.weaxi.cn'
}

const useMysql = process.env.DB_TYPE === 'mysql' || process.env.DB_HOST || process.env.DATABASE_URL
const db = useMysql ? require('./db.mysql') : require('./db')
if (useMysql) {
  db.initDb()
    .then(() => console.log('[DB] MySQL initialized'))
    .catch(err => {
      console.error('[DB] MySQL init failed:', err.message)
      process.exit(1)
    })
}

const TARGET_GUILD_ID = '621631744026206738'

// ─── PatPlayer 跨站登录（体验任务）───
// PatPlayer 签发一次性 ticket（HMAC-SHA256），NFTI 校验后创建"借用"会话：
// 会话的 cliHome 指向 docker 只读挂载的 PatPlayer 会话目录，复用其真实 QQ token，
// 无需重新扫码（避免单设备登录互踢）。发帖/读帖等需要 token 的功能全部可用。
const PAT_TICKET_SECRET = process.env.PAT_TICKET_SECRET || ''
const PATPLAYER_SESSIONS_DIR = process.env.PATPLAYER_SESSIONS_DIR || '/patplayer-sessions'
const PAT_BASE_URL = process.env.PAT_BASE_URL || 'https://pat.weaxi.cn'

/**
 * 校验 PatPlayer ticket（R3-2 同步：2026-08-21 PatPlayer 已不再在 ticket 中携带真实会话 ID）。
 * ticket 格式：base64url(payload).hmacHex
 * payload = { tiny_id, nickname, sid, exp }（sid = 一次性授权码，32 位 hex）
 * 返回 { tiny_id, nickname, sid } 或 null（无效/过期/伪造）。
 * 真实会话 ID 需再凭 ticket 调 PatPlayer /api/learn/nfti-session-grant 换发（见 exchangePatSession）。
 */
function verifyPatTicket(ticket) {
  if (!PAT_TICKET_SECRET || !ticket || typeof ticket !== 'string') return null
  const dot = ticket.indexOf('.')
  if (dot <= 0) return null
  const b64 = ticket.slice(0, dot)
  const sig = ticket.slice(dot + 1)
  const expect = crypto.createHmac('sha256', PAT_TICKET_SECRET).update(b64).digest('hex')
  // 常量时间比较，防时序攻击
  const a = Buffer.from(String(sig))
  const b = Buffer.from(expect)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  let payload
  try { payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) } catch (_) { return null }
  if (!payload || !payload.tiny_id || !payload.sid || !payload.exp) return null
  if (Date.now() > payload.exp) return null // 过期
  // 授权码白名单：32 位 hex（PatPlayer 一次性授权码格式）
  if (!/^[0-9a-f]{32}$/.test(String(payload.sid))) return null
  return {
    tiny_id: String(payload.tiny_id),
    nickname: String(payload.nickname || '同学').slice(0, 128),
    sid: String(payload.sid),
  }
}

// R3-2：凭 ticket 向 PatPlayer 服务端换发真实 QQ 会话 ID（URL 中永不出现 pat_sid）
async function exchangePatSession(ticket) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(PAT_BASE_URL + '/api/learn/nfti-session-grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
      signal: ctrl.signal,
    })
    if (!res.ok) return null // 401 ticket 无效 / 410 授权码已消费或过期 / 5xx
    const data = await res.json()
    if (!data || !data.pat_sid) return null
    return { pat_sid: String(data.pat_sid), tiny_id: data.tiny_id, nickname: data.nickname }
  } catch (_) {
    return null // 网络失败/超时
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 判断借用的 PatPlayer 会话目录是否仍存在且含 CLI 凭证。
 * 若 PatPlayer 侧已清理会话（30 天闲置回收），借用失效。
 */
function patSessionUsable(patSid) {
  const dir = path.join(PATPLAYER_SESSIONS_DIR, patSid)
  try {
    return fs.existsSync(path.join(dir, '.qqcli', '.env'))
  } catch (_) { return false }
}

console.log('[SERVER] Loading server.js v3')

const SESSIONS_FILE = path.join(__dirname, 'data', 'sessions.json')

// 会话闲置有效期：QQ 登录 token 只要不在其他设备登录就一直有效（平台侧），
// 应用层不能把登录会话过早清掉，否则用户隔一阵回来就被迫重新扫码。
// 默认 30 天无活动才清理，可用 SESSION_IDLE_TTL_MS 环境变量覆盖。
const SESSION_IDLE_TTL_MS = Number(process.env.SESSION_IDLE_TTL_MS) || 30 * 24 * 60 * 60 * 1000

function ensureSessionsDir() {
  const dir = path.dirname(SESSIONS_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function loadSessionsFromDisk() {
  ensureSessionsDir()
  if (!fs.existsSync(SESSIONS_FILE)) return {}
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'))
  } catch { return {} }
}

function saveSessionsToDisk(sessionsObj) {
  ensureSessionsDir()
  const toSave = {}
  for (const [id, s] of Object.entries(sessionsObj)) {
    if (!s.tiny_id && (!s.nickname || s.nickname === '同学')) continue
    toSave[id] = {
      sessionId: s.sessionId, homeDir: s.homeDir,
      tiny_id: s.tiny_id || '', nickname: s.nickname || '',
      token_obtained: !!s.token_obtained,
    }
    // 借用 PatPlayer 会话：cliHome 一并持久化（容器重启后仍可复用）
    if (s.cliHome) toSave[id].cliHome = s.cliHome
  }
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(toSave, null, 2))
}

const diskSessions = loadSessionsFromDisk()
const sessions = new Map()
let sessionsDirty = false

let restoredCount = 0, skippedCount = 0
for (const [id, data] of Object.entries(diskSessions)) {
  if (!data.tiny_id && (!data.nickname || data.nickname === '同学')) {
    skippedCount++
    continue
  }
  if (data.homeDir && fs.existsSync(data.homeDir)) {
    sessions.set(id, { ...data, lastActive: Date.now() })
    restoredCount++
  }
}
console.log('[SERVER] Restored', restoredCount, 'sessions, skipped', skippedCount)

setInterval(() => {
  const now = Date.now()
  for (const [id, s] of sessions) {
    if (now - s.lastActive > SESSION_IDLE_TTL_MS) cleanupSession(id)
  }
  if (sessionsDirty) { saveSessionsToDisk(Object.fromEntries(sessions)); sessionsDirty = false }
}, 60000)

function markDirty() { sessionsDirty = true }
function cleanupSession(id) {
  const s = sessions.get(id)
  if (!s) return
  try { fs.rmSync(s.homeDir, { recursive: true, force: true }) } catch (_) {}
  sessions.delete(id)
  markDirty()
}

function createSession() {
  const sessionId = crypto.randomBytes(8).toString('hex')
  const homeDir = path.join(__dirname, 'data', 'sessions', sessionId)
  fs.mkdirSync(homeDir, { recursive: true })
  const session = { sessionId, homeDir, lastActive: Date.now(), tiny_id: '', nickname: '', token_obtained: false }
  sessions.set(sessionId, session)
  markDirty()
  return sessionId
}

function getSession(sessionId) {
  const s = sessions.get(sessionId)
  if (!s) return null
  s.lastActive = Date.now()
  return s
}

/** 校验 session 并返回 tiny_id，失败返回 null */
function requireSession(params, topSessionId) {
  const sid = topSessionId || params.session || params.sessionId || ''
  if (!sid) return null
  const s = getSession(sid)
  if (!s || !s.tiny_id) return null
  s.lastActive = Date.now()
  return s.tiny_id
}

/** 基础参数格式校验 */
function validateParam(value, pattern, maxLen) {
  if (!value || typeof value !== 'string') return false
  if (maxLen && value.length > maxLen) return false
  if (pattern && !pattern.test(value)) return false
  return true
}

/**
 * 校验「写操作」的身份：
 * - 携带 tiny_id 时必须与当前登录 session 匹配（禁止伪造他人身份写入）
 * - 未登录/游客必须有 guest_id 才能写入
 * 返回 { tiny_id } 或 { guest_id } 表示允许，返回 null 表示拒绝。
 */
function requireWriteIdentity(params, sessionId) {
  if (params && params.tiny_id) {
    const myTinyId = requireSession(params, sessionId)
    if (!myTinyId || params.tiny_id !== myTinyId) return null
    return { tiny_id: myTinyId }
  }
  if (params && params.guest_id && typeof params.guest_id === 'string' && params.guest_id.length <= 128) {
    return { guest_id: params.guest_id }
  }
  return null
}

const ADMIN_ROLE_TTL = 10 * 60 * 1000 // 服务端角色缓存 TTL：撤权后最长 10 分钟生效

/**
 * 管理员权限（fail-closed）：
 * - 已扫码登录（有 tiny_id）
 * - 在 TARGET_GUILD_ID 频道中角色为「频道主」或「管理员」
 * 角色通过 CLI 查询，结果缓存在 session 上（logout/cleanup 时随 session 清除，
 * 且带 TTL 10 分钟重查）。查询失败返回 '' 且不缓存（下次重查）；正常查到才缓存。
 * 返回 'owner' | 'admin' | ''；'' 一律视为无权限。
 */
async function getAdminRole(s) {
  if (!s || !s.tiny_id) return ''
  if (s.adminRole !== undefined && s.adminRoleAt !== undefined && Date.now() - s.adminRoleAt < ADMIN_ROLE_TTL) return s.adminRole
  let role = ''
  try {
    const result = await runCli(['manage', 'get-my-join-guild-info'], 15000, sessionEnv(s))
    if (result.success && result.data) {
      // 频道主/管理员可能出现在 created/managed/joined 任一分组（以 CLI 实测为准），全部检查
      const guilds = [
        ...(result.data.created_guilds || []),
        ...(result.data.managed_guilds || []),
        ...(result.data.joined_guilds || []),
      ]
      const mine = guilds.find(g => g.guild_id === TARGET_GUILD_ID)
      if (mine && mine.role) {
        const r = String(mine.role)
        if (r.includes('频道主')) role = 'owner'
        else if (r.includes('管理员')) role = 'admin'
      }
    }
  } catch (err) {
    console.error('[getAdminRole]', err.message)
    return '' // CLI 异常：fail-closed，不缓存，下次重查
  }
  s.adminRole = role
  s.adminRoleAt = Date.now()
  return role
}

/** 管理员校验：返回 role（'owner'|'admin'）或 null（未登录/无权限） */
async function requireAdmin(params, sessionId) {
  const sid = sessionId || (params && (params.session || params.sessionId)) || ''
  if (!sid) return null
  const s = getSession(sid)
  if (!s || !s.tiny_id) return null
  const role = await getAdminRole(s)
  return role || null
}

// 计数器/统计类操作的轻量限流（按来源 IP，每分钟上限）
const rateBuckets = new Map()
function checkRateLimit(req, keyPrefix, maxPerMinute) {
  // 取可信代理链中真实客户端 IP：宝塔 nginx + Docker nginx 均以 append 模式
  // 追加 X-Forwarded-For，客户端只能伪造最前面的条目。链尾是内网代理地址
  // （恒定值，不能作为限流键），倒数第二条才是用户真实 IP（由代理追加，不可伪造）。
  // 只有单层代理或直连时退化到 remoteAddress。
  const xff = (req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean)
  let ip
  if (xff.length >= 2) {
    ip = xff[xff.length - 2]
  } else if (xff.length === 1) {
    ip = xff[0]
  } else {
    ip = req.socket.remoteAddress || 'unknown'
  }
  const key = keyPrefix + ':' + ip
  const now = Date.now()
  const bucket = (rateBuckets.get(key) || []).filter(t => now - t < 60000)
  if (bucket.length >= maxPerMinute) return false
  bucket.push(now)
  rateBuckets.set(key, bucket)
  // 防内存膨胀：整体超过 10k 个桶时清理一次
  if (rateBuckets.size > 10000) {
    for (const [k, v] of rateBuckets) {
      const alive = v.filter(t => now - t < 60000)
      if (alive.length === 0) rateBuckets.delete(k)
    }
  }
  return true
}

function updateSessionUser(sessionId, tiny_id, nickname) {
  const s = sessions.get(sessionId)
  if (!s) return
  s.tiny_id = tiny_id || s.tiny_id || ''
  s.nickname = nickname || s.nickname || ''
  markDirty()
}

// ─── QQ 身份反查（防同名误绑，2026-08-15 与 PatPlayer 同源修复）───
// 频道内有大量同名成员（实测 "." 昵称几十个，guild-member-search 一次返回 20+ 全匹配），
// 绝不能盲取 members[0]（会绑到错误的 tiny_id → 他人帖子/测试结果串号）。
// 流程：精确同名过滤 → 唯一则采用；多个同名则逐个 get-user-info --tiny-id 全字段比对核实。
// 返回 { tinyId, nickname, reason }；reason: ''=成功 / 'ambiguous'=同名歧义 / 'not_found'=未找到
async function resolveTinyIdBySearch(env) {
  let reason = ''
  try {
    const globalInfo = await runCli(['manage', 'get-user-info'], 10000, env)
    const gd = (globalInfo && globalInfo.data) || {}
    const guildInfo = await runCli(['manage', 'get-user-info', '--guild-id=' + TARGET_GUILD_ID], 10000, env)
    const gi = (guildInfo && guildInfo.data) || {}
    const guildNick = gi.nickname || gi.member_name || gi.global_nickname || ''
    const globalNick = gd.nickname || gd.global_nickname || ''
    const nickname = guildNick || globalNick

    // 关键词集合：频道/全局昵称 + 去装饰前缀版本 + 拆词兜底（空格/括号长昵称完整搜索搜不到）
    const kwSet = new Set()
    const add = (v) => { const str = String(v || '').trim(); if (str) kwSet.add(str) }
    add(gi.nickname)
    add(gi.member_name)
    add(gi.global_nickname)
    add(gd.nickname)
    add(gd.global_nickname)
    for (const kw of [...kwSet]) {
      const cleaned = kw.replace(/^[【\[\(（][^】\]\)）]+[】\]\)）]\s*/, '').trim()
      if (cleaned && cleaned !== kw) add(cleaned)
    }
    for (const kw of [...kwSet]) {
      for (const frag of String(kw).split(/[^\w\u4e00-\u9fa5]+/)) if (frag && frag.length >= 2) add(frag)
    }

    // 收集候选：按关键词依次搜索，取首个有结果的搜索的全部成员（第一页，够用）
    let members = []
    for (const kw of kwSet) {
      const searchR = await runCli(['manage', 'guild-member-search', '--guild-id=' + TARGET_GUILD_ID, '--keyword=' + kw], 10000, env)
      const ms = (searchR && searchR.data && searchR.data.members) || []
      if (ms.length > 0) { members = ms; break }
    }
    if (!members.length) return { tinyId: '', nickname, reason: 'not_found' }

    // ① 精确同名过滤（排除 "。。"/"。。。" 等相似但不同的昵称）
    const selfNicks = [gi.nickname, gi.member_name].map((v) => String(v || '').trim()).filter(Boolean)
    const candidates = members.filter((m) => selfNicks.includes(String(m.nickname || '').trim()))
    if (candidates.length === 1) {
      return { tinyId: String(candidates[0].tinyid || candidates[0].tiny_id || ''), nickname, reason: '' }
    }
    if (candidates.length === 0) return { tinyId: '', nickname, reason: 'not_found' }

    // ② 多个同名候选：逐个 get-user-info --tiny-id 与本人全字段比对
    //    （全局昵称/性别等通常各不相同，可区分本人；上限 8 个，命中第 2 个即判歧义提前终止）
    const fields = ['nickname', 'member_name', 'global_nickname', 'gender']
    let verified = null
    let ambiguous = false
    for (const c of candidates.slice(0, 8)) {
      const r = await runCli(['manage', 'get-user-info', '--guild-id=' + TARGET_GUILD_ID, '--tiny-id=' + (c.tinyid || c.tiny_id)], 10000, env)
      const info = (r && r.data) || {}
      const allMatch = fields.every((f) => {
        const a = String(info[f] || '').trim()
        const b = String(gi[f] || '').trim()
        return !a || !b || a === b // 任一侧缺失该字段则跳过，不当作反证
      })
      if (allMatch) {
        if (verified) { ambiguous = true; break }
        verified = c
      }
    }
    if (verified && !ambiguous) return { tinyId: String(verified.tinyid || verified.tiny_id || ''), nickname, reason: '' }
    return { tinyId: '', nickname, reason: ambiguous ? 'ambiguous' : 'not_found' }
  } catch (_) {
    return { tinyId: '', nickname: '', reason: 'not_found' }
  }
}

function sessionEnv(s) {
  // 借用 PatPlayer 会话时（cliHome），HOME 指向只读挂载的 PatPlayer 会话目录，
  // 直接复用其真实 QQ token；否则用自身会话目录。
  const home = s.cliHome || s.homeDir
  const env = { HOME: home }
  if (process.platform === 'win32') env.USERPROFILE = home
  return env
}

/** 发送 JSON 响应 */
function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(body)
}

async function publishFeedDirect(env, content, imagePath, tmpDir) {
  console.log('[SERVER] publishFeedDirect: looking up NFTI channel')

  const chResult = await runCli(['manage', 'get-guild-channel-list', '--guild-id=' + TARGET_GUILD_ID], 15000, env)
  if (!chResult || !chResult.success || !chResult.data) {
    return { success: false, error: '获取版块列表失败' }
  }

  const channels = chResult.data.channels || chResult.data.data || []
  const nftiChannel = Array.isArray(channels) ? channels.find(c =>
    (c.channel_name || c.name || '').toLowerCase().includes('nfti')
  ) : null

  if (!nftiChannel) return { success: false, error: '未找到 NFTI 版块' }

  const channelId = nftiChannel.channel_id || nftiChannel.id
  console.log('[SERVER] publishFeedDirect: found NFTI channel_id=' + channelId)

  // 临时文件必须写到可写目录：借用的 cliHome 是只读挂载，不能写；用 NFTI 自身会话目录
  const writeDir = tmpDir || env.HOME || process.env.HOME || process.env.USERPROFILE || '/tmp'
  if (!fs.existsSync(writeDir)) fs.mkdirSync(writeDir, { recursive: true })
  const contentFile = path.join(writeDir, 'share-content.txt')
  fs.writeFileSync(contentFile, content, 'utf8')

  const pubArgs = [
    'feed', 'publish-feed',
    '--guild-id=' + TARGET_GUILD_ID,
    '--channel-id=' + channelId,
    '--content-file=' + contentFile,
  ]
  if (imagePath) pubArgs.push('--image', imagePath)

  const result = await runCli(pubArgs, 60000, env)
  console.log('[SERVER] publishFeedDirect: result success=' + (result && result.success) + ' feedId=' + ((result && result.data && result.data.feed_id) || ''))

  if (result && result.success && result.data) {
    const feedId = result.data.feed_id || ''
    let feedUrl = ''
    if (feedId) {
      try {
        const shareResult = await runCli(['feed', 'get-feed-share-url', '--feed-id=' + feedId, '--guild-id=' + TARGET_GUILD_ID], 10000, env)
        if (shareResult && shareResult.success && shareResult.data) {
          feedUrl = shareResult.data.share_url || shareResult.data.url || ''
        }
      } catch (_) {}
      if (!feedUrl) feedUrl = 'https://pd.qq.com/s/' + feedId
    }
    return { success: true, data: result.data, feedUrl }
  }

  const errMsg = (result && result.error && result.error.message) || (result && result.error) || '发帖失败'
  return { success: false, error: errMsg }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

function serveStaticFile(req, res, filePath) {
  const publicDir = path.join(__dirname, 'public')
  // 安全：去掉前导 /，拼接到 public 目录下，验证不越界
  const normalized = path.normalize(filePath).replace(/^\//, '')
  const fullPath = path.join(publicDir, normalized)
  if (!fullPath.startsWith(publicDir + path.sep)) {
    res.writeHead(403)
    return res.end('Forbidden')
  }
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    res.writeHead(404)
    return res.end('Not found')
  }
  const content = fs.readFileSync(fullPath)
  res.writeHead(200, {
    'Content-Type': getMimeType(fullPath),
    'Content-Length': Buffer.byteLength(content),
    'Cache-Control': 'public, max-age=3600',
  })
  res.end(content)
}

const server = http.createServer((req, res) => {
  // 统一设置 CORS 头，所有响应自动继承
  const corsOrigin = getAllowOrigin(req)
  res.setHeader('Access-Control-Allow-Origin', corsOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost')
    // 健康检查端点（Docker healthcheck 使用；此服务无前端静态资源）
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ success: true }))
    }
    const filePath = url.pathname === '/' ? '/index.html' : url.pathname
    return serveStaticFile(req, res, filePath)
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

  let body = ''
  req.on('data', chunk => (body += chunk))
  req.on('end', async () => {
    try {
      const { action, session: sessionId, params = {}, content: topContent, imageBase64: topImageBase64, count: topCount, feedId: topFeedId } = JSON.parse(body)
      console.log('[SERVER] Received action:', action)

      switch (action) {
        case 'import-session': {
          // 体验任务：PatPlayer 签发 ticket → 服务端换发会话 ID → 创建借用会话（复用其 QQ token）
          const ticket = params.ticket || ''
          const verified = verifyPatTicket(ticket)
          if (!verified) return sendJson(res, 401, { success: false, error: 'ticket 无效或已过期' })
          // R3-2：真实会话 ID 不再出现在 ticket 中，改为向 PatPlayer 服务端一次性换发
          const grant = await exchangePatSession(ticket)
          if (!grant || !grant.pat_sid) return sendJson(res, 410, { success: false, error: 'PatPlayer 体验凭据已失效，请回南中科技局重新登录' })
          if (!patSessionUsable(grant.pat_sid)) return sendJson(res, 410, { success: false, error: 'PatPlayer 登录已过期，请回南中科技局重新登录' })
          const sid = createSession()
          const s = getSession(sid)
          s.tiny_id = verified.tiny_id
          s.nickname = verified.nickname
          s.token_obtained = true
          s.cliHome = path.join(PATPLAYER_SESSIONS_DIR, grant.pat_sid)
          markDirty()
          saveSessionsToDisk(Object.fromEntries(sessions))
          return sendJson(res, 200, { success: true, session: sid, user: { tiny_id: s.tiny_id, nickname: s.nickname } })
        }

        case 'login': {
          clearWindowsCredential()
          const sid = createSession()
          const s = getSession(sid)
          const qrcodePath = path.join(s.homeDir, 'login-qrcode.png')
          const env = sessionEnv(s)
          let result
          try { result = await runCli(['login', '--yes', `--qrcode-path=${qrcodePath}`], 30000, env) }
          catch (err) { throw err }
          if (!result || result.success === false) {
            return sendJson(res, 200, { session: sid, error: (result && result.error && result.error.message) || 'CLI 返回未知错误', qrcode_base64: '', verification_uri: '', expires_in_s: 0 })
          }
          let qrcodeBase64 = (result.data && result.data.qr_code) || ''
          if (!qrcodeBase64 && fs.existsSync(qrcodePath)) qrcodeBase64 = fs.readFileSync(qrcodePath).toString('base64')
          return sendJson(res, 200, {
            session: sid, verification_uri: (result.data && result.data.verification_uri) || '',
            qrcode_base64: qrcodeBase64, expires_in_s: (result.data && result.data.expires_in_s) || 120,
          })
        }

        case 'poll-token': {
          if (!sessionId) return sendJson(res, 400, { error: 'Missing session' })
          const s = getSession(sessionId)
          if (!s) return sendJson(res, 404, { error: 'Session expired or invalid' })
          if (s.token_obtained) {
            return sendJson(res, 200, { session: sessionId, success: true, status: 'authorized', user: { tiny_id: s.tiny_id, nickname: s.nickname } })
          }
          const env = sessionEnv(s)
          let result
          try { result = await runCli(['login', 'poll-token'], 25000, env) }
          catch (err) { console.error('[poll-token]', err.message); return sendJson(res, 200, { success: false, status: 'pending_authorization', error: '令牌检查失败' }) }
          console.log('[SERVER] poll-token: CLI raw result=' + JSON.stringify(result).slice(0, 600))
          if (!result.success) {
            return sendJson(res, 200, { session: sessionId, success: false, status: 'pending_authorization', error: (result.error && result.error.message) || '' })
          }
          const isAuthorized = (result.data && result.data.status === 'authorized') || result.status === 'authorized'
          if (isAuthorized) {
            s.token_obtained = true; markDirty()
            try {
              const globalInfo = await runCli(['manage', 'get-user-info'], 10000, env)
              console.log('[SERVER] poll-token: globalInfo keys=', Object.keys(globalInfo.data || {}).join(','), 'raw=', JSON.stringify(globalInfo).slice(0, 500))
              const globalTinyId = (globalInfo.data && (globalInfo.data.tiny_id || globalInfo.data.tinyid || globalInfo.data.user_id || globalInfo.data.id || globalInfo.data.openid || globalInfo.data.uid || '')) || ''
              if (globalTinyId) { s.tiny_id = globalTinyId; console.log('[SERVER] poll-token: got tiny_id from global:', s.tiny_id) }
              const guildInfo = await runCli(['manage', 'get-user-info', '--guild-id=' + TARGET_GUILD_ID], 10000, env)
              console.log('[SERVER] poll-token: guildInfo keys=', Object.keys(guildInfo.data || {}).join(','), 'raw=', JSON.stringify(guildInfo).slice(0, 500))
              // 优先用频道昵称 → 频道内全局昵称 → 全局 API 昵称 → tiny_id 前 6 位 → '同学'
              const guildNick = guildInfo.data && (guildInfo.data.nickname || guildInfo.data.global_nickname || guildInfo.data.member_name)
              const globalNick = globalInfo.data && (globalInfo.data.nickname || globalInfo.data.global_nickname || '')
              s.nickname = guildNick || globalNick || '同学'
              if (!s.tiny_id) {
                const guildTinyId = (guildInfo.data && (guildInfo.data.tiny_id || guildInfo.data.tinyid || '')) || ''
                if (guildTinyId) s.tiny_id = guildTinyId
              }
              if (!s.tiny_id) {
                // 首选：直接身份（原始 MCP 响应含本人 tiny_id，无需搜索，杜绝同名歧义）
                try {
                  const raw = await runCliCaptureRaw(['manage', 'get-user-info', '--guild-id=' + TARGET_GUILD_ID], 10000, env)
                  const directTinyId = extractOwnTinyId(raw.captured)
                  if (directTinyId) { s.tiny_id = directTinyId; console.log('[SERVER] poll-token: tiny_id from raw MCP:', s.tiny_id) }
                } catch (_) {}
              }
              if (!s.tiny_id) {
                // 兜底：用昵称搜索频道成员（防同名误绑：精确同名 + 多候选全字段核实）
                try {
                  const { tinyId: searchTinyId } = await resolveTinyIdBySearch(env)
                  if (searchTinyId) { s.tiny_id = searchTinyId; console.log('[SERVER] poll-token: tiny_id from member search:', s.tiny_id) }
                } catch (_) {}
              }
              console.log('[SERVER] poll-token: final tiny_id=' + s.tiny_id + ' nickname=' + s.nickname)
              markDirty()
            } catch (_) {}
          }
          return sendJson(res, 200, { session: sessionId, success: true, status: isAuthorized ? 'authorized' : 'pending', user: isAuthorized ? { tiny_id: s.tiny_id, nickname: s.nickname } : undefined })
        }

        case 'get-my-info': {
          if (!sessionId) return sendJson(res, 400, { error: 'Missing session' })
          const s = getSession(sessionId)
          if (!s) return sendJson(res, 404, { error: 'Session expired or invalid' })
          const env = sessionEnv(s)
          const args = ['manage', 'get-user-info']
          if (params.guildId && validateParam(params.guildId, /^[a-zA-Z0-9-_]+$/, 64)) args.push('--guild-id=' + params.guildId)
          try { const result = await runCli(args, 10000, env); return sendJson(res, 200, result) }
          catch (err) { console.error('[get-my-info]', err.message); return sendJson(res, 200, { success: false, error: '获取用户信息失败' }) }
        }

        case 'get-my-join-guild-info': {
          if (!sessionId) return sendJson(res, 400, { error: 'Missing session' })
          const s = getSession(sessionId)
          if (!s) return sendJson(res, 404, { error: 'Session expired or invalid' })
          const env = sessionEnv(s)
          try { const result = await runCli(['manage', 'get-my-join-guild-info'], 15000, env); return sendJson(res, 200, result) }
          catch (err) { console.error('[get-my-join-guild-info]', err.message); return sendJson(res, 200, { success: false, error: '获取频道信息失败' }) }
        }

        case 'get-guild-info': {
          if (!sessionId) return sendJson(res, 400, { error: 'Missing session' })
          const s = getSession(sessionId)
          if (!s) return sendJson(res, 404, { error: 'Session expired or invalid' })
          if (!params.guildId || !validateParam(params.guildId, /^[a-zA-Z0-9-_]+$/, 64)) return sendJson(res, 400, { error: '无效的 guildId' })
          const env = sessionEnv(s)
          try { const result = await runCli(['manage', 'get-guild-info', '--guild-id=' + params.guildId], 15000, env); return sendJson(res, 200, result) }
          catch (err) { console.error('[get-guild-info]', err.message); return sendJson(res, 200, { success: false, error: '获取频道信息失败' }) }
        }

        case 'get-guild-feeds': {
          if (!sessionId) return sendJson(res, 400, { error: 'Missing session' })
          const s = getSession(sessionId)
          if (!s) return sendJson(res, 404, { error: 'Session expired or invalid' })
          const env = sessionEnv(s)
          const targetCount = Math.min(params.count || topCount || 10, 250)
          let allFeeds = [], attachInfo = ''
          for (let page = 0; page < 10 && allFeeds.length < targetCount; page++) {
            const args = ['feed', 'get-guild-feeds', '--guild-id=' + TARGET_GUILD_ID, '--get-type=2', '--count=50']
            if (attachInfo) args.push('--feed-attach-info=' + attachInfo)
            try {
              const result = await runCli(args, 15000, env)
              if (result.success && result.data && result.data.feeds) {
                allFeeds = allFeeds.concat(result.data.feeds)
                attachInfo = result.data.feed_attach_info || ''
                if (!attachInfo) break
              } else break
            } catch (_) { break }
          }
          return sendJson(res, 200, { success: true, data: { feeds: allFeeds.slice(0, targetCount) } })
        }

        case 'get-my-feeds': {
          if (!sessionId) return sendJson(res, 400, { error: 'Missing session' })
          const s = getSession(sessionId)
          if (!s) return sendJson(res, 404, { error: 'Session expired or invalid' })
          const env = sessionEnv(s)
          if (!s.tiny_id && s.nickname) {
            // 首选直取本人 tiny_id（原始 MCP 响应）；失败才走成员搜索兜底（防同名误绑）
            try {
              const raw = await runCliCaptureRaw(['manage', 'get-user-info', '--guild-id=' + TARGET_GUILD_ID], 10000, env)
              const directTinyId = extractOwnTinyId(raw.captured)
              if (directTinyId) updateSessionUser(sessionId, directTinyId, s.nickname)
              else {
                const { tinyId: tid } = await resolveTinyIdBySearch(env)
                if (tid) updateSessionUser(sessionId, tid, s.nickname)
              }
            } catch (_) {}
          }
          if (!s.tiny_id) return sendJson(res, 200, { success: true, data: { feeds: [] } })
          const targetCount = Math.min(params.count || topCount || 10, 20)
          const seenIds = new Set(), myFeeds = []
          let attachInfo = ''
          for (let page = 0; page < 10 && myFeeds.length < targetCount; page++) {
            const args = ['feed', 'get-guild-feeds', '--guild-id=' + TARGET_GUILD_ID, '--get-type=2', '--count=50']
            if (attachInfo) args.push('--feed-attach-info=' + attachInfo)
            try {
              const result = await runCli(args, 15000, env)
              if (result.success && result.data) {
                if (result.data.feeds) {
                  for (const f of result.data.feeds) {
                    if (f.author_id === s.tiny_id && !seenIds.has(f.feed_id)) {
                      seenIds.add(f.feed_id); myFeeds.push(f)
                    }
                  }
                }
                attachInfo = result.data.feed_attach_info || ''
                if (!attachInfo) break
              } else break
            } catch (_) { break }
          }
          if (myFeeds.length < targetCount) {
            try {
              const nr = await runCli(['feed', 'get-notices', '--guild-id=' + TARGET_GUILD_ID, '--page-num=100'], 15000, env)
              if (nr.success && nr.data?.notices) {
                const noticeFeedIds = new Set()
                for (const n of nr.data.notices) {
                  if (n.feed_id && (n.type === '评论' || n.type === '回复' || n.type === '帖子点赞') && !seenIds.has(n.feed_id)) {
                    noticeFeedIds.add(n.feed_id)
                  }
                }
                for (const fid of noticeFeedIds) {
                  if (myFeeds.length >= targetCount) break
                  try {
                    const detail = await runCli(['feed', 'get-feed-detail', '--feed-id=' + fid, '--guild-id=' + TARGET_GUILD_ID], 10000, env)
                    if (detail.success && detail.data?.feed && detail.data.feed.author_id === s.tiny_id) {
                      seenIds.add(fid)
                      myFeeds.push({
                        feed_id: fid, title: detail.data.feed.title || '',
                        author: detail.data.feed.author || '', author_id: detail.data.feed.author_id || '',
                        channel_name: detail.data.feed.channel_name || '', create_time: detail.data.feed.create_time || '',
                        prefer_count: detail.data.feed.prefer_count || 0, comment_count: detail.data.feed.comment_count || 0,
                        images: detail.data.feed.content_richtext?.images || [],
                      })
                    }
                  } catch (_) {}
                }
              }
            } catch (_) {}
          }
          return sendJson(res, 200, { success: true, data: { feeds: myFeeds.slice(0, targetCount) } })
        }

        case 'get-hot-feeds': {
          if (!sessionId) return sendJson(res, 400, { error: 'Missing session' })
          const s = getSession(sessionId)
          if (!s) return sendJson(res, 404, { error: 'Session expired or invalid' })
          const env = sessionEnv(s)
          try {
            // 1. 获取 NFTI 板块 ID
            const chResult = await runCli(['manage', 'get-guild-channel-list', '--guild-id=' + TARGET_GUILD_ID], 15000, env)
            if (!chResult.success || !chResult.data) {
              return sendJson(res, 200, { success: true, data: { feeds: [] } })
            }
            const channels = chResult.data.channels || chResult.data.data || []
            const nftiChannel = Array.isArray(channels) ? channels.find(function(c) {
              return (c.channel_name || c.name || '').toLowerCase().includes('nfti')
            }) : null
            if (!nftiChannel) {
              return sendJson(res, 200, { success: true, data: { feeds: [] } })
            }
            const channelId = nftiChannel.channel_id || nftiChannel.id

            // 2. 取该板块的最新帖子
            const targetCount = Math.min(params.count || topCount || 10, 50)
            let allFeeds = [], attachInfo = ''
            for (let page = 0; page < 5 && allFeeds.length < targetCount; page++) {
              const args = ['feed', 'get-channel-timeline-feeds', '--guild-id=' + TARGET_GUILD_ID, '--channel-id=' + channelId, '--count=50']
              if (attachInfo) args.push('--feed-attach-info=' + attachInfo)
              const result = await runCli(args, 15000, env)
              if (result.success && result.data && result.data.feeds) {
                allFeeds = allFeeds.concat(result.data.feeds)
                attachInfo = result.data.feed_attach_info || ''
                if (!attachInfo) break
              } else break
            }
            return sendJson(res, 200, { success: true, data: { feeds: allFeeds.slice(0, targetCount) } })
          } catch (err) { console.error('[get-hot-feeds]', err.message); return sendJson(res, 200, { success: false, error: '获取热帖失败' }) }
        }

        case 'get-feed-share-url': {
          if (!sessionId) return sendJson(res, 400, { error: 'Missing session' })
          const s = getSession(sessionId)
          if (!s) return sendJson(res, 404, { error: 'Session expired or invalid' })
          const feedId = params.feedId || topFeedId || ''
          if (!feedId || !validateParam(feedId, /^[a-zA-Z0-9-_]+$/, 64)) return sendJson(res, 400, { error: '无效的 feedId' })
          const env = sessionEnv(s)
          try {
            const result = await runCli(['feed', 'get-feed-share-url', '--feed-id=' + feedId, '--guild-id=' + TARGET_GUILD_ID], 10000, env)
            return sendJson(res, 200, result)
          } catch (err) { console.error('[get-feed-share-url]', err.message); return sendJson(res, 200, { success: false, error: '获取分享链接失败' }) }
        }

        case 'publish-feed': {
          if (!sessionId) return sendJson(res, 400, { error: 'Missing session' })
          const s = getSession(sessionId)
          if (!s) return sendJson(res, 404, { error: 'Session expired or invalid' })
          const env = sessionEnv(s)
          const content = params.content || topContent || ''
          const imageBase64 = params.imageBase64 || topImageBase64 || ''
          console.log('[SERVER] publish-feed: content_len=' + content.length + ' image_len=' + (imageBase64 ? imageBase64.length : 0))
          if (!content && !imageBase64) return sendJson(res, 400, { error: 'Missing content or image' })
          // 防止超大 base64 写入（限制 5MB）
          if (imageBase64 && imageBase64.length > 5 * 1024 * 1024) return sendJson(res, 400, { error: '图片太大' })
          try {
            let imagePath = ''
            if (imageBase64) {
              imagePath = saveBase64Image(s.homeDir, imageBase64)
              console.log('[SERVER] publish-feed: saved image to', imagePath)
            }
            const result = await publishFeedDirect(env, content, imagePath, s.homeDir)
            console.log('[SERVER] publish-feed: result success=' + result.success + ' feedUrl=' + (result.feedUrl || ''))
            return sendJson(res, 200, result)
          } catch (err) { console.error('[publish-feed]', err.message); return sendJson(res, 200, { success: false, error: '发帖失败' }) }
        }

        case 'logout': {
          if (!sessionId) return sendJson(res, 200, { success: true })
          const s = getSession(sessionId)
          if (s) { cleanupSession(sessionId) }
          return sendJson(res, 200, { success: true })
        }

        case 'session-status': {
          if (!sessionId) return sendJson(res, 200, { valid: false })
          const s = getSession(sessionId)
          return sendJson(res, 200, s ? { valid: true, tiny_id: s.tiny_id, nickname: s.nickname } : { valid: false })
        }

        case 'db-save-user': {
          if (!requireWriteIdentity(params, sessionId)) return sendJson(res, 403, { success: false, error: '无权访问' })
          const user = await db.findOrCreateUser(params)
          return sendJson(res, 200, { success: true, data: user })
        }
        case 'db-get-user': {
          const myTinyId = requireSession(params, sessionId)
          if (!myTinyId || (params.tinyId && params.tinyId !== myTinyId)) return sendJson(res, 403, { success: false, error: '无权访问' })
          const user = await db.findUserByTinyId(myTinyId); return sendJson(res, 200, { success: true, data: user }) }
        case 'db-save-result': {
          const identity = requireWriteIdentity(params, sessionId)
          if (!identity) return sendJson(res, 403, { success: false, error: '无权访问' })
          // 只写入被校验过的身份字段，剥离客户端混入的另一身份（防止 tiny_id + guest_id 双写污染统计）
          const cleanParams = { ...params, tiny_id: identity.tiny_id || null, guest_id: identity.guest_id || null }
          const r = await db.saveTestResult(cleanParams)
          // 登录用户的每份测试结果自动生成默契口令（幂等：已有未过期口令不重建），
          // 用户可直接在个人中心找到对应口令发起分享；游客记录不生成（口令需绑定 QQ 账号）
          if (r && r.tiny_id) {
            const assessmentType = r.assessment_type || 'nfti'
            const prefix = assessmentType === 'holland' ? 'HL' : 'NF'
            await db.upsertShareCode({
              resultId: r.id, tinyId: r.tiny_id, assessmentType,
              code: generateShareCode(prefix),
            }).catch(err => console.warn('[db-save-result] auto share code failed:', err.message))
          }
          return sendJson(res, 200, { success: true, data: r })
        }
        case 'db-get-results': {
          // 登录用户：只能读自己的 tiny_id 记录
          const myTinyId = requireSession(params, sessionId)
          if (myTinyId) {
            const targetTinyId = params.tinyId || myTinyId
            if (targetTinyId !== myTinyId) return sendJson(res, 403, { success: false, error: '无权访问' })
            const results = await db.getTestResultsByTinyId(targetTinyId)
            return sendJson(res, 200, { success: true, data: results })
          }
          // 游客：凭 guest_id 读自己的记录（写路径允许 guest_id，读路径保持对称）
          const guestId = params.guestId || params.guest_id
          if (!guestId || typeof guestId !== 'string' || guestId.length > 128) {
            return sendJson(res, 403, { success: false, error: '无权访问' })
          }
          const results = await db.getTestResultsByGuestId(guestId)
          return sendJson(res, 200, { success: true, data: results })
        }
        case 'db-get-latest-result': {
          const myTinyId = requireSession(params, sessionId)
          if (!myTinyId) return sendJson(res, 403, { success: false, error: '无权访问' })
          const r = await db.getLatestTestResult(myTinyId); return sendJson(res, 200, { success: true, data: r }) }

        // ═══════════ 默契度分享（share / match）═══════════
        case 'share-create': {
          const myTinyId = requireSession(params, sessionId)
          if (!myTinyId) return sendJson(res, 403, { success: false, error: '请先登录' })
          if (!checkRateLimit(req, 'share-create', 20)) return sendJson(res, 429, { success: false, error: '操作过于频繁' })
          const resultId = params.result_id || ''
          if (!validateParam(resultId, /^[0-9a-f-]{36}$/i, 36)) return sendJson(res, 400, { success: false, error: '无效的结果 ID' })
          const result = await db.getTestResultById(resultId)
          if (!result) return sendJson(res, 404, { success: false, error: '测试结果不存在' })
          // 口令只能绑定自己的结果（游客记录 tiny_id 为空，不允许生成）
          if (!result.tiny_id || result.tiny_id !== myTinyId) {
            return sendJson(res, 403, { success: false, error: '只能为登录后本人的测试结果生成口令' })
          }
          const assessmentType = result.assessment_type || 'nfti'
          const prefix = assessmentType === 'holland' ? 'HL' : 'NF'
          const code = generateShareCode(prefix)
          const created = await db.upsertShareCode({
            resultId, tinyId: myTinyId, assessmentType, code,
          })
          const base = process.env.PUBLIC_BASE_URL || 'https://nfti.weaxi.cn'
          return sendJson(res, 200, {
            success: true,
            code: created.code,
            url: `${base}/match?code=${created.code}`,
            expires_at: created.expires_at,
            recreated: created.recreated,
          })
        }

        case 'share-redeem': {
          const myTinyId = requireSession(params, sessionId)
          if (!myTinyId) return sendJson(res, 403, { success: false, error: '请先登录' })
          if (!checkRateLimit(req, 'share-redeem', 30)) return sendJson(res, 429, { success: false, error: '尝试过于频繁，请稍后再试' })
          const code = String(params.code || '').toUpperCase().trim()
          if (!validateParam(code, /^[A-Z]{2}-[A-Z2-9]{4}-[A-Z2-9]{4}$/, 12)) {
            return sendJson(res, 400, { success: false, error: '口令格式不正确' })
          }
          const share = await db.findShareWithResult(code)
          if (!share) return sendJson(res, 404, { success: false, error: '口令不存在' })
          if (share.revoked) return sendJson(res, 410, { success: false, error: '口令已被主人停用' })
          if (new Date(share.expires_at).getTime() < Date.now()) {
            return sendJson(res, 410, { success: false, error: '口令已过期，请让对方重新生成' })
          }
          return sendJson(res, 200, {
            success: true,
            share: {
              code: share.code,
              owner_nick: share.owner_nick,
              assessment_type: share.assessment_type,
              result: share.result, // 摘要（不含 answers）
              expires_at: share.expires_at,
              is_own: share.owner_tiny_id === myTinyId, // 是否自己的分享链接（提示用）
            },
          })
        }

        case 'share-match': {
          const myTinyId = requireSession(params, sessionId)
          if (!myTinyId) return sendJson(res, 403, { success: false, error: '请先登录' })
          if (!checkRateLimit(req, 'share-match', 20)) return sendJson(res, 429, { success: false, error: '操作过于频繁，请稍后再试' })
          const code = String(params.code || '').toUpperCase().trim()
          const myResultId = params.result_id || ''
          if (!validateParam(code, /^[A-Z]{2}-[A-Z2-9]{4}-[A-Z2-9]{4}$/, 12)) {
            return sendJson(res, 400, { success: false, error: '口令格式不正确' })
          }
          if (!validateParam(myResultId, /^[0-9a-f-]{36}$/i, 36)) return sendJson(res, 400, { success: false, error: '无效的结果 ID' })
          const share = await db.findShareWithResult(code)
          if (!share) return sendJson(res, 404, { success: false, error: '口令不存在' })
          if (share.revoked) return sendJson(res, 410, { success: false, error: '口令已被主人停用' })
          if (new Date(share.expires_at).getTime() < Date.now()) {
            return sendJson(res, 410, { success: false, error: '口令已过期，请让对方重新生成' })
          }
          // 自己的结果
          const myResult = await db.getTestResultById(myResultId)
          if (!myResult) return sendJson(res, 404, { success: false, error: '你的测试结果不存在' })
          if (!myResult.tiny_id || myResult.tiny_id !== myTinyId) {
            return sendJson(res, 403, { success: false, error: '只能使用本人登录后的测试结果' })
          }
          // 鲁棒：不能用自己的分享链接和自己配对（前端已有提示，后端强制拦截）
          if (share.owner_tiny_id === myTinyId) {
            return sendJson(res, 400, { success: false, error: '这是你自己的分享链接，把它发给朋友才能配对' })
          }
          // 幂等：同一口令 + 同一对结果只算一次
          const cached = await db.getMatchByPair(code, share.result_id, myResultId)
          if (cached) {
            return sendJson(res, 200, {
              success: true, cached: true, match_id: cached.id,
              match: { score: cached.score, level: cached.level, levelName: levelNameOf(cached.level), data: cached.data, ai_story: cached.ai_story },
              owner: { nick: share.owner_nick, result: share.result },
              mine: { id: myResult.id, type_code: myResult.type_code, type_name: myResult.type_name },
            })
          }
          const a = {
            assessment_type: share.assessment_type,
            type_code: share.result.type_code,
            type_name: share.result.type_name,
            scores: share.result.scores || {},
          }
          const b = {
            assessment_type: myResult.assessment_type || 'nfti',
            type_code: myResult.type_code,
            type_name: myResult.type_name,
            scores: myResult.scores || {},
          }
          const computed = computeMatch(a, b)
          const saved = await db.saveMatchResult({
            shareCode: code,
            aTinyId: share.owner_tiny_id,
            bTinyId: myTinyId,
            aResultId: share.result_id,
            bResultId: myResultId,
            aAssessment: a.assessment_type,
            bAssessment: b.assessment_type,
            score: computed.score,
            level: computed.level,
            data: computed.data,
            aiStory: null,
          })
          return sendJson(res, 200, {
            success: true, cached: false, match_id: saved ? saved.id : null,
            match: { score: computed.score, level: computed.level, levelName: computed.levelName, data: computed.data, ai_story: saved ? saved.ai_story : null },
            owner: { nick: share.owner_nick, result: share.result },
            mine: { id: myResult.id, type_code: myResult.type_code, type_name: myResult.type_name },
          })
        }

        // 配对结果持久化分享：凭 match_id 读取（match_id 即分享凭证，UUID 128bit 不可枚举）
        case 'match-get': {
          if (!checkRateLimit(req, 'match-get', 60)) return sendJson(res, 429, { success: false, error: '操作过于频繁' })
          const matchId = params.match_id || ''
          if (!validateParam(matchId, /^[0-9a-f-]{36}$/i, 36)) return sendJson(res, 400, { success: false, error: '无效的配对 ID' })
          const row = await db.getMatchById(matchId)
          if (!row) return sendJson(res, 404, { success: false, error: '配对结果不存在' })
          return sendJson(res, 200, {
            success: true,
            match: {
              id: row.id,
              score: row.score,
              level: row.level,
              levelName: levelNameOf(row.level),
              data: row.data,
              ai_story: row.ai_story,
              created_at: row.created_at,
            },
            owner: { nick: row.a_nick, type_code: row.a_type_code, type_name: row.a_type_name },
            mate: { nick: row.b_nick, type_code: row.b_type_code, type_name: row.b_type_name },
          })
        }

        case 'share-list': {
          const myTinyId = requireSession(params, sessionId)
          if (!myTinyId) return sendJson(res, 403, { success: false, error: '请先登录' })
          const rows = await db.getShareCodesByOwner(myTinyId)
          return sendJson(res, 200, { success: true, data: rows })
        }

        case 'share-revoke': {
          const myTinyId = requireSession(params, sessionId)
          if (!myTinyId) return sendJson(res, 403, { success: false, error: '请先登录' })
          const code = String(params.code || '').toUpperCase().trim()
          if (!validateParam(code, /^[A-Z]{2}-[A-Z2-9]{4}-[A-Z2-9]{4}$/, 12)) {
            return sendJson(res, 400, { success: false, error: '口令格式不正确' })
          }
          const ok = await db.revokeShareCode(code, myTinyId)
          return sendJson(res, 200, { success: ok })
        }

        case 'share-pairs': {
          const myTinyId = requireSession(params, sessionId)
          if (!myTinyId) return sendJson(res, 403, { success: false, error: '请先登录' })
          const rows = await db.getMatchPairsByOwner(myTinyId)
          return sendJson(res, 200, { success: true, data: rows })
        }

        case 'match-ai': {
          const myTinyId = requireSession(params, sessionId)
          if (!myTinyId) return sendJson(res, 403, { success: false, error: '请先登录' })
          // AI 调用有成本：IP 限流 + 用户级间隔限流（与 ai-proxy 的 per-session 一致，避免多用户互相 429）
          if (!checkRateLimit(req, 'match-ai', 10)) return sendJson(res, 429, { success: false, error: '操作过于频繁，请稍后再试' })
          if (!globalThis._matchAiRate) globalThis._matchAiRate = {}
          // 防内存膨胀：超 10k 用户记录时重置（丢弃限流状态，可接受）
          if (Object.keys(globalThis._matchAiRate).length > 10000) globalThis._matchAiRate = {}
          const aiNow = Date.now()
          const lastAi = globalThis._matchAiRate[myTinyId] || 0
          if (aiNow - lastAi < 1500) return sendJson(res, 429, { success: false, error: '请求过于频繁，请稍后再试' })
          globalThis._matchAiRate[myTinyId] = aiNow
          const code = String(params.code || '').toUpperCase().trim()
          const myResultId = params.result_id || ''
          if (!validateParam(code, /^[A-Z]{2}-[A-Z2-9]{4}-[A-Z2-9]{4}$/, 12)) {
            return sendJson(res, 400, { success: false, error: '口令格式不正确' })
          }
          if (!validateParam(myResultId, /^[0-9a-f-]{36}$/i, 36)) return sendJson(res, 400, { success: false, error: '无效的结果 ID' })
          const share = await db.findShareWithResult(code)
          if (!share || share.revoked) return sendJson(res, 404, { success: false, error: '口令不存在或已停用' })
          if (new Date(share.expires_at).getTime() < Date.now()) {
            return sendJson(res, 410, { success: false, error: '口令已过期，请让对方重新生成' })
          }
          const myResult = await db.getTestResultById(myResultId)
          if (!myResult || !myResult.tiny_id || myResult.tiny_id !== myTinyId) {
            return sendJson(res, 403, { success: false, error: '只能使用本人登录后的测试结果' })
          }
          // 鲁棒：不能用自己的分享链接和自己配对
          if (share.owner_tiny_id === myTinyId) {
            return sendJson(res, 400, { success: false, error: '这是你自己的分享链接，把它发给朋友才能配对' })
          }
          // 确保 match 记录存在（前端流程先 share-match 再 match-ai，此处兜底）
          let matchRow = await db.getMatchByPair(code, share.result_id, myResultId)
          if (!matchRow) {
            const computed = computeMatch(
              { assessment_type: share.assessment_type, type_code: share.result.type_code, type_name: share.result.type_name, scores: share.result.scores || {} },
              { assessment_type: myResult.assessment_type || 'nfti', type_code: myResult.type_code, type_name: myResult.type_name, scores: myResult.scores || {} }
            )
            matchRow = await db.saveMatchResult({
              shareCode: code, aTinyId: share.owner_tiny_id, bTinyId: myTinyId,
              aResultId: share.result_id, bResultId: myResultId,
              aAssessment: share.assessment_type, bAssessment: myResult.assessment_type || 'nfti',
              score: computed.score, level: computed.level, data: computed.data, aiStory: null,
            })
          }
          if (matchRow && matchRow.ai_story) {
            return sendJson(res, 200, { success: true, cached: true, ai_story: matchRow.ai_story })
          }
          // 生成 AI 剧本（DeepSeek，同对结果缓存）
          const apiKey = process.env.DEEPSEEK_API_KEY || ''
          if (!apiKey) return sendJson(res, 200, { success: false, error: 'AI 服务未配置' })
          const defaultModel = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'
          const aName = share.result.type_name
          const bName = myResult.type_name
          const aScores = JSON.stringify(share.result.scores || {})
          const bScores = JSON.stringify(myResult.scores || {})
          const system = '你是南方中学的「人格观察员」，专门写校园里两个人格之间的微信聊天记录。要求：口语化、有画面感、带点损但温暖，全部发生在南方中学的真实场景（教室、食堂、操场、社团、晚自习、走廊）。对话要像真实学生的微信聊天：有来有回、互相接梗、能看出两人的关系特点。不要出现"默契度""百分比""测评"等字样。'
          const user = `请为这两个人写一段微信聊天记录（默契剧本）。\n\n人格A：${aName}（维度分数：${aScores}）\n人格B：${bName}（维度分数：${bScores}）\n\n严格按以下格式输出两段：\n【默契剧本】\n（6-10 条两人的微信聊天对话，每行一条，格式必须是「人格A: 内容」或「人格B: 内容」，说话人只能写"人格A"或"人格B"，不要用具体名字。对话要能看出两人的关系特点，带点损但温暖）\n\n【TA眼中的你】\n（80-120字，以"在${bName}眼里，"开头，写人格A在B眼中是什么样的人，用${bName}的口吻）`
          try {
            const apiRes = await fetch('https://api.deepseek.com/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: defaultModel,
                messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
                temperature: 0.9,
                max_tokens: 1000,
                thinking: { type: 'disabled' },
              }),
            })
            if (!apiRes.ok) {
              console.error('[match-ai] DeepSeek error:', apiRes.status)
              return sendJson(res, 200, { success: false, error: 'AI 服务暂不可用' })
            }
            const data = await apiRes.json()
            const story = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || ''
            if (!story) return sendJson(res, 200, { success: false, error: 'AI 生成内容为空' })
            await db.updateMatchAiStory(code, share.result_id, myResultId, story)
            return sendJson(res, 200, { success: true, cached: false, ai_story: story })
          } catch (err) {
            console.error('[match-ai] error:', err.message)
            return sendJson(res, 200, { success: false, error: 'AI 服务暂不可用' })
          }
        }

        case 'db-save-ai-chat': {
          const identity = requireWriteIdentity(params, sessionId)
          if (!identity) return sendJson(res, 403, { success: false, error: '无权访问' })
          // 游客（仅 guest_id）的聊天历史由前端 localStorage 兜底，且 ai_chats 表
          // 无 guest_id 列、读取接口又要求登录，DB 写入只会产生无法读取的孤儿行 → 跳过
          if (identity.guest_id) return sendJson(res, 200, { success: true, data: null })
          // 只允许通过 tiny_id 解析归属，不接受客户端指定的 userId（防止覆盖他人记录）
          const u = await db.findUserByTinyId(identity.tiny_id)
          const chatUserId = u ? u.id : null
          const existing = chatUserId ? await db.getAiChatByUser(chatUserId) : null
          const chat = existing
            ? await db.updateAiChat(chatUserId, params.messages)
            : await db.saveAiChat({
                ...params,
                userId: chatUserId,
                tiny_id: identity.tiny_id,
                guest_id: null,
              })
          return sendJson(res, 200, { success: true, data: chat })
        }
        case 'db-get-ai-chat': {
          const myTinyId = requireSession(params, sessionId)
          if (!myTinyId) return sendJson(res, 403, { success: false, error: '无权访问' })
          const targetTinyId = params.tiny_id || myTinyId
          if (targetTinyId !== myTinyId) return sendJson(res, 403, { success: false, error: '无权访问' })
          const u = await db.findUserByTinyId(targetTinyId)
          const chat = u ? await db.getAiChatByUser(u.id) : null
          return sendJson(res, 200, { success: true, data: chat })
        }
        case 'counter-increment': {
          // 计数器是公开统计，但加 IP 限流防刷（每分钟 30 次）
          if (!checkRateLimit(req, 'counter', 30)) return sendJson(res, 429, { success: false, error: '操作过于频繁' })
          const count = await db.incrementCounter()
          return sendJson(res, 200, { success: true, count })
        }
        case 'counter-get': { const count = await db.getCounter(); return sendJson(res, 200, { success: true, count }) }
        case 'stats': { const stats = await db.getStats(); return sendJson(res, 200, { success: true, data: stats }) }
        case 'collection-stats': { const data = await db.getCollectionStats(); return sendJson(res, 200, { success: true, data }) }
        case 'stats-page-visit': {
          // 页面访问统计：公开但限流（每分钟 60 次），超限静默忽略本次计数
          if (!checkRateLimit(req, 'page-visit', 60)) return sendJson(res, 200, { success: true, page_visits: 0 })
          const pageVisits = await db.incrementPageVisit()
          return sendJson(res, 200, { success: true, page_visits: pageVisits })
        }
        case 'db-cross-check': {
          const myTinyId = requireSession(params, sessionId)
          if (!myTinyId) return sendJson(res, 403, { success: false, error: '无权访问' })
          if (params.tinyId && params.tinyId !== myTinyId) return sendJson(res, 403, { success: false, error: '无权访问' })
          const cross = await db.getCrossCheck(myTinyId)
          return sendJson(res, 200, { success: true, data: cross })
        }
        case 'cross-save': {
          const identity = requireWriteIdentity(params, sessionId)
          if (!identity) return sendJson(res, 403, { success: false, error: '无权访问' })
          // 只写入被校验过的身份字段
          const r = await db.saveCrossAnalysis({ ...params, tiny_id: identity.tiny_id || null, guest_id: identity.guest_id || null })
          return sendJson(res, 200, r)
        }
        case 'cross-get': {
          const identity = requireWriteIdentity(params, sessionId)
          if (!identity) return sendJson(res, 403, { success: false, error: '无权访问' })
          // 只按被校验过的身份查询
          const r = await db.getCrossAnalysis({ ...params, tiny_id: identity.tiny_id || null, guest_id: identity.guest_id || null })
          return sendJson(res, 200, { success: true, data: r })
        }

        // ─── 管理面板（管理员权限校验） ───
        case 'admin-check': {
          const sid = sessionId || params.session || ''
          const s = getSession(sid)
          if (!s || !s.tiny_id) return sendJson(res, 200, { success: true, isAdmin: false, role: '' })
          if (params.force) s.adminRole = undefined
          const role = await getAdminRole(s)
          return sendJson(res, 200, { success: true, isAdmin: !!role, role: role || '' })
        }
        case 'admin-stats-timeseries': {
          const adminRole = await requireAdmin(params, sessionId)
          if (!adminRole) return sendJson(res, 403, { success: false, error: '需要管理员权限' })
          const days = Math.min(parseInt(params.days, 10) || 30, 90)
          const data = await db.getStatsTimeseries(days)
          return sendJson(res, 200, { success: true, data })
        }
        case 'admin-test-records': {
          const adminRole = await requireAdmin(params, sessionId)
          if (!adminRole) return sendJson(res, 403, { success: false, error: '需要管理员权限' })
          const limit = Math.min(parseInt(params.limit, 10) || 30, 100)
          const data = await db.getTestRecords(limit)
          return sendJson(res, 200, { success: true, data })
        }

        // ─── 邀请码系统（内测版） ───
        case 'invite-generate': {
          const adminRole = await requireAdmin(params, sessionId)
          if (!adminRole) return sendJson(res, 403, { success: false, error: '需要管理员权限' })
          if (!checkRateLimit(req, 'invite-generate', 10)) return sendJson(res, 429, { success: false, error: '操作过于频繁' })
          const count = Math.min(params.count || 1, 20)
          const codes = await db.generateInviteCodes(count)
          return sendJson(res, 200, { success: true, codes })
        }
        case 'invite-redeem': {
          const { code, fingerprint } = params
          if (!code || !fingerprint) return sendJson(res, 400, { success: false, error: '缺少邀请码或设备指纹' })
          // 频率限制：同一 fingerprint 每分钟最多尝试 5 次
          const rateKey = 'redeem_' + fingerprint
          const now = Date.now()
          if (!globalThis._redeemRates) globalThis._redeemRates = {}
          if (!globalThis._redeemRates[rateKey]) globalThis._redeemRates[rateKey] = []
          const attempts = globalThis._redeemRates[rateKey].filter(t => now - t < 60000)
          if (attempts.length >= 5) return sendJson(res, 429, { success: false, error: '尝试过于频繁，请稍后再试' })
          attempts.push(now)
          globalThis._redeemRates[rateKey] = attempts
          const result = await db.redeemInviteCode(code, fingerprint)
          return sendJson(res, 200, result)
        }
        case 'invite-list': {
          const adminRole = await requireAdmin(params, sessionId)
          if (!adminRole) return sendJson(res, 403, { success: false, error: '需要管理员权限' })
          const rows = await db.listInviteCodes()
          // 管理员可见：含绑定指纹（面板前端负责脱敏展示）
          const safe = (rows || []).map(r => ({ code: r.code, used: r.used, multi_use: r.multi_use, browser_fingerprint: r.browser_fingerprint, used_at: r.used_at, created_at: r.created_at }))
          return sendJson(res, 200, { success: true, data: safe })
        }
        case 'invite-update': {
          const adminRole = await requireAdmin(params, sessionId)
          if (!adminRole) return sendJson(res, 403, { success: false, error: '需要管理员权限' })
          if (!checkRateLimit(req, 'invite-update', 30)) return sendJson(res, 429, { success: false, error: '操作过于频繁' })
          const code = params.code || ''
          if (!validateParam(code, /^[a-zA-Z0-9-]+$/, 32)) return sendJson(res, 400, { success: false, error: '无效的邀请码' })
          const ok = await db.updateInviteCode(code, !!params.multi_use)
          return sendJson(res, 200, { success: ok })
        }
        case 'invite-delete': {
          const adminRole = await requireAdmin(params, sessionId)
          if (!adminRole) return sendJson(res, 403, { success: false, error: '需要管理员权限' })
          if (!checkRateLimit(req, 'invite-delete', 30)) return sendJson(res, 429, { success: false, error: '操作过于频繁' })
          const code = params.code || ''
          if (!validateParam(code, /^[a-zA-Z0-9-]+$/, 32)) return sendJson(res, 400, { success: false, error: '无效的邀请码' })
          const ok = await db.deleteInviteCode(code)
          return sendJson(res, 200, { success: ok })
        }
        case 'verify-beta-session': {
          const { sessionToken, fingerprint } = params
          const result = await db.verifyBetaSession(sessionToken, fingerprint)
          return sendJson(res, 200, result)
        }

        // ─── 反馈提交代理（隐藏 EmailJS 凭据，仅存服务端） ───
        case 'feedback-send': {
          // 限流：同一 IP 每分钟最多 5 条反馈
          if (!checkRateLimit(req, 'feedback', 5)) return sendJson(res, 429, { success: false, error: '反馈提交过于频繁，请稍后再试' })
          const category = params.category || ''
          const content = (params.content || '').toString().slice(0, 2000)
          const contact = (params.contact || '').toString().slice(0, 200)
          if (!content) return sendJson(res, 400, { success: false, error: '请填写反馈内容' })
          const serviceId = process.env.EMAILJS_SERVICE_ID || ''
          const templateId = process.env.EMAILJS_TEMPLATE_ID || ''
          const publicKey = process.env.EMAILJS_PUBLIC_KEY || ''
          const recipient = process.env.FEEDBACK_RECIPIENT || ''
          if (!serviceId || !templateId || !publicKey || !recipient) {
            return sendJson(res, 500, { success: false, error: '反馈服务未配置' })
          }
          try {
            const apiRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                service_id: serviceId,
                template_id: templateId,
                user_id: publicKey,
                template_params: {
                  to_email: recipient,
                  reply_to: recipient,
                  from_name: 'NFTI 反馈系统',
                  category,
                  content,
                  contact: contact || '未填写',
                  time: new Date().toLocaleString(),
                },
              }),
            })
            if (apiRes.ok) return sendJson(res, 200, { success: true })
            const errText = await apiRes.text()
            console.error('[feedback-send] EmailJS error:', apiRes.status, errText.slice(0, 200))
            return sendJson(res, 200, { success: false, error: '反馈提交失败，请稍后重试' })
          } catch (err) {
            console.error('[feedback-send] error:', err.message)
            return sendJson(res, 200, { success: false, error: '反馈服务暂不可用' })
          }
        }

        // ─── AI 代理（隐藏 DeepSeek API Key，Key 仅存在服务端） ───
        case 'ai-proxy': {
          const { messages = [], stream = false, model: modelParam, temperature = 0.7, max_tokens = 2048 } = params
          const apiKey = process.env.DEEPSEEK_API_KEY || ''
          const defaultModel = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'
          const model = modelParam || defaultModel
          // 思考模式：默认关闭（deepseek-v4-flash 默认开启思考，content 会为空）
          const thinkingParam = params.thinking || { type: 'disabled' }
          const thinkingType = thinkingParam && thinkingParam.type === 'enabled' ? 'enabled' : 'disabled'
          const thinking = { type: thinkingType }

          if (!apiKey) return sendJson(res, 500, { success: false, error: 'DeepSeek API 未配置' })
          if (!messages.length) return sendJson(res, 400, { success: false, error: '缺少 messages 参数' })
          // 校验 session
          if (!requireSession(params, sessionId)) return sendJson(res, 403, { success: false, error: '请先登录' })
          // 速率限制：简单进程级限流
          const aiRateKey = 'ai_' + (params.session || '')
          globalThis._aiRate = globalThis._aiRate || {}
          const now = Date.now()
          const lastCall = globalThis._aiRate[aiRateKey] || 0
          if (now - lastCall < 1000) return sendJson(res, 429, { success: false, error: '请求过于频繁，请稍后再试' })
          globalThis._aiRate[aiRateKey] = now

          try {
            const apiRes = await fetch('https://api.deepseek.com/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
              },
              body: JSON.stringify({ model, messages, temperature, max_tokens, stream, thinking }),
            })

            if (!apiRes.ok) {
              const errText = await apiRes.text()
              console.error('[ai-proxy] DeepSeek error:', apiRes.status, errText.slice(0, 200))
              return sendJson(res, 200, { success: false, error: 'AI 服务暂不可用' })
            }

            if (stream) {
              // 流式响应：管道直通 DeepSeek SSE
              res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
              })
              const reader = apiRes.body.getReader()
              const decoder = new TextDecoder()
              try {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) { res.end(); break }
                  res.write(decoder.decode(value, { stream: true }))
                }
              } catch (e) {
                if (e.name !== 'AbortError') console.error('[ai-proxy] stream error:', e.message)
                res.end()
              }
              return // 不调用 sendJson
            } else {
              const data = await apiRes.json()
              return sendJson(res, 200, { success: true, data })
            }
          } catch (err) {
            console.error('[ai-proxy] error:', err.message)
            return sendJson(res, 200, { success: false, error: 'AI 服务暂不可用' })
          }
        }

        default: return sendJson(res, 400, { error: '未知操作' })
      }
    } catch (err) {
      console.error('[ERROR]', err.stack || err.message)
      return sendJson(res, 500, { success: false, error: '服务器内部错误' })
    }
  })
})

const PORT = process.env.PORT || 9000
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => console.log('NFBTI Proxy running on port ' + PORT))
}

function persistSessions() { saveSessionsToDisk(Object.fromEntries(sessions)) }
process.on('exit', persistSessions)
process.on('SIGINT', () => { persistSessions(); process.exit() })
process.on('SIGTERM', () => { persistSessions(); process.exit() })

module.exports = server
