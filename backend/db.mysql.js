const mysql = require('mysql2/promise')
const crypto = require('crypto')

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'nfti',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
}

const pool = mysql.createPool(config)

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  tiny_id VARCHAR(64) NOT NULL,
  nick VARCHAR(128) DEFAULT NULL,
  gender VARCHAR(16) DEFAULT NULL,
  province VARCHAR(64) DEFAULT NULL,
  country VARCHAR(64) DEFAULT NULL,
  avatar_url TEXT DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_users_tiny_id (tiny_id),
  KEY idx_users_nick (nick)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS test_results (
  id CHAR(36) PRIMARY KEY,
  assessment_type VARCHAR(32) NOT NULL DEFAULT 'nfti',
  user_id CHAR(36) DEFAULT NULL,
  tiny_id VARCHAR(64) DEFAULT NULL,
  guest_id VARCHAR(64) DEFAULT NULL,
  mode VARCHAR(16) NOT NULL DEFAULT 'full',
  type_code VARCHAR(64) NOT NULL,
  type_name VARCHAR(128) NOT NULL,
  scores JSON NOT NULL,
  answers JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_results_user_id (user_id),
  KEY idx_results_tiny_id (tiny_id),
  KEY idx_results_guest_id (guest_id),
  KEY idx_results_created_at (created_at),
  KEY idx_results_type_code (type_code),
  CONSTRAINT fk_results_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_chats (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) DEFAULT NULL,
  tiny_id VARCHAR(64) DEFAULT NULL,
  messages JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_chats_user_id (user_id),
  KEY idx_chats_tiny_id (tiny_id),
  CONSTRAINT fk_chats_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_stats (
  id TINYINT NOT NULL DEFAULT 1 PRIMARY KEY,
  counter BIGINT NOT NULL DEFAULT 0,
  page_visits BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cross_analyses (
  id CHAR(36) PRIMARY KEY,
  tiny_id VARCHAR(64) DEFAULT NULL,
  guest_id VARCHAR(64) DEFAULT NULL,
  nfti_code VARCHAR(64) NOT NULL,
  holland_code VARCHAR(64) NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_cross_user_codes (tiny_id, nfti_code, holland_code),
  KEY idx_cross_guest (guest_id, nfti_code, holland_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invite_codes (
  code VARCHAR(32) NOT NULL PRIMARY KEY,
  used TINYINT(1) NOT NULL DEFAULT 0,
  multi_use TINYINT(1) NOT NULL DEFAULT 0,
  browser_fingerprint VARCHAR(128) DEFAULT NULL,
  session_token VARCHAR(64) DEFAULT NULL,
  used_at DATETIME(3) DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_invite_used (used),
  KEY idx_session_token (session_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 默契度分享口令：一份测试结果一个口令，30 天过期（惰性判断），可手动停用
CREATE TABLE IF NOT EXISTS share_codes (
  code VARCHAR(20) NOT NULL PRIMARY KEY,
  result_id CHAR(36) NOT NULL,
  owner_tiny_id VARCHAR(64) NOT NULL,
  assessment_type VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_share_result (result_id),
  KEY idx_share_owner (owner_tiny_id),
  KEY idx_share_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 默契度结果缓存：a（口令主人）× b（配对者）一次一算，AI 剧本随行缓存
CREATE TABLE IF NOT EXISTS match_results (
  id CHAR(36) PRIMARY KEY,
  share_code VARCHAR(20) NOT NULL,
  a_tiny_id VARCHAR(64) NOT NULL,
  b_tiny_id VARCHAR(64) NOT NULL,
  a_result_id CHAR(36) NOT NULL,
  b_result_id CHAR(36) NOT NULL,
  a_assessment VARCHAR(32) NOT NULL,
  b_assessment VARCHAR(32) NOT NULL,
  score INT NOT NULL,
  level VARCHAR(16) NOT NULL,
  data JSON NOT NULL,
  ai_story TEXT DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_match_share (share_code),
  KEY idx_match_owner (a_tiny_id),
  KEY idx_match_b (b_tiny_id),
  UNIQUE KEY uk_match_pair (share_code, a_result_id, b_result_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`.trim()

async function initDb() {
  // Create database first if it does not exist (requires privileges).
  const tmp = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    waitForConnections: true,
    connectionLimit: 1,
  })
  try {
    await tmp.execute(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  } finally {
    await tmp.end()
  }

  // Create tables inside the target database.
  for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
    await pool.execute(stmt + ';')
  }
  await pool.execute(`INSERT IGNORE INTO app_stats (id, counter, page_visits) VALUES (1, 0, 0)`)
  // 迁移：match_results 表补唯一键（老库 CREATE TABLE IF NOT EXISTS 不会加），
  // 幂等：先查 information_schema，存在则跳过
  try {
    const [[idx]] = await pool.execute(
      `SELECT COUNT(*) AS n FROM information_schema.statistics
       WHERE table_schema = ? AND table_name = 'match_results' AND index_name = 'uk_match_pair'`,
      [config.database]
    )
    if (!idx || idx.n === 0) {
      // 清理潜在重复行（保留每组最早的），再加唯一键
      await pool.execute(
        `DELETE m1 FROM match_results m1
         INNER JOIN match_results m2
           ON m1.share_code = m2.share_code AND m1.a_result_id = m2.a_result_id AND m1.b_result_id = m2.b_result_id
           AND m1.created_at > m2.created_at`
      )
      await pool.execute(
        `ALTER TABLE match_results ADD UNIQUE KEY uk_match_pair (share_code, a_result_id, b_result_id)`
      )
    }
  } catch (err) {
    console.warn('[DB] match_results unique key migration skipped:', err.message)
  }
}

function now() {
  // MySQL 5.7 DATETIME 不支持 ISO 格式的 T 和 Z
  return new Date().toISOString().replace('T', ' ').replace('Z', '')
}

async function findOrCreateUser(params) {
  const db = await pool.getConnection()
  try {
    const id = crypto.randomUUID()
    await db.execute(
      `INSERT INTO users (id, tiny_id, nick, gender, province, country, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         nick = COALESCE(VALUES(nick), nick),
         gender = COALESCE(VALUES(gender), gender),
         province = COALESCE(VALUES(province), province),
         country = COALESCE(VALUES(country), country),
         avatar_url = COALESCE(VALUES(avatar_url), avatar_url),
         updated_at = VALUES(updated_at)`,
      [id, params.tiny_id, params.nick || null, params.gender || null, params.province || null, params.country || null, params.avatar_url || null, now(), now()]
    )
    const [rows] = await db.execute('SELECT * FROM users WHERE tiny_id = ?', [params.tiny_id])
    return rows[0] || null
  } finally {
    db.release()
  }
}

async function findUserByTinyId(tinyId) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE tiny_id = ?', [tinyId])
  return rows[0] || null
}

async function saveTestResult(params) {
  const id = crypto.randomUUID()
  let userId = params.user_id || null
  if (!userId && params.tiny_id) {
    const u = await findUserByTinyId(params.tiny_id)
    if (u) userId = u.id
  }
  await pool.execute(
    `INSERT INTO test_results (id, assessment_type, user_id, tiny_id, guest_id, mode, type_code, type_name, scores, answers, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, params.assessment_type || 'nfti', userId, params.tiny_id || null, params.guest_id || null, params.mode || 'full', params.type_code, params.type_name, JSON.stringify(params.scores || {}), JSON.stringify(params.answers || []), now()]
  )
  invalidateCollectionCache()
  const [rows] = await pool.execute('SELECT * FROM test_results WHERE id = ?', [id])
  if (rows[0]) {
    rows[0].scores = safeJsonParse(rows[0].scores)
    rows[0].answers = safeJsonParse(rows[0].answers)
  }
  return rows[0]
}

async function getTestResultsByUser(userId) {
  const [rows] = await pool.execute(
    'SELECT * FROM test_results WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  )
  return rows.map(normalizeResult)
}

async function getTestResultsByTinyId(tinyId) {
  const [rows] = await pool.execute(
    'SELECT * FROM test_results WHERE tiny_id = ? ORDER BY created_at DESC',
    [tinyId]
  )
  return rows.map(normalizeResult)
}

async function getTestResultsByGuestId(guestId) {
  const [rows] = await pool.execute(
    'SELECT * FROM test_results WHERE guest_id = ? ORDER BY created_at DESC',
    [guestId]
  )
  return rows.map(normalizeResult)
}

async function getLatestTestResult(userId) {
  const [rows] = await pool.execute(
    'SELECT * FROM test_results WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [userId]
  )
  return rows[0] ? normalizeResult(rows[0]) : null
}

async function saveAiChat(params) {
  const id = crypto.randomUUID()
  let userId = params.userId || params.user_id || null
  if (!userId && params.tiny_id) {
    const u = await findUserByTinyId(params.tiny_id)
    if (u) userId = u.id
  }
  await pool.execute(
    `INSERT INTO ai_chats (id, user_id, tiny_id, messages, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, params.tiny_id || null, JSON.stringify(params.messages || []), now(), now()]
  )
  return getAiChatByUser(userId || params.tiny_id)
}

async function updateAiChat(userId, messages) {
  await pool.execute(
    'UPDATE ai_chats SET messages = ?, updated_at = ? WHERE user_id = ?',
    [JSON.stringify(messages || []), now(), userId]
  )
  return getAiChatByUser(userId)
}

async function getAiChatByUser(userId) {
  if (!userId) return null
  const [rows] = await pool.execute('SELECT * FROM ai_chats WHERE user_id = ?', [userId])
  if (!rows[0]) return null
  rows[0].messages = safeJsonParse(rows[0].messages)
  return rows[0]
}

async function incrementCounter() {
  await pool.execute(
    'INSERT INTO app_stats (id, counter) VALUES (1, 1) ON DUPLICATE KEY UPDATE counter = counter + 1'
  )
  const [rows] = await pool.execute('SELECT counter FROM app_stats WHERE id = 1')
  return rows[0]?.counter || 0
}

async function getCounter() {
  const [rows] = await pool.execute('SELECT counter FROM app_stats WHERE id = 1')
  return rows[0]?.counter || 0
}

async function setCounter(value) {
  await pool.execute(
    'INSERT INTO app_stats (id, counter) VALUES (1, ?) ON DUPLICATE KEY UPDATE counter = ?',
    [value, value]
  )
  return value
}

async function getCrossCheck(tinyId) {
  if (!tinyId) return { hasNfti: false, hasHolland: false }
  const [[{ nftiCount }]] = await pool.execute("SELECT COUNT(*) AS nftiCount FROM test_results WHERE tiny_id = ? AND assessment_type = 'nfti'", [tinyId])
  const [[{ hollandCount }]] = await pool.execute("SELECT COUNT(*) AS hollandCount FROM test_results WHERE tiny_id = ? AND assessment_type = 'holland'", [tinyId])
  const result = { hasNfti: nftiCount > 0, hasHolland: hollandCount > 0 }
  if (result.hasNfti) {
    const [rows] = await pool.execute("SELECT type_code, type_name, mode FROM test_results WHERE tiny_id = ? AND assessment_type = 'nfti' ORDER BY created_at DESC LIMIT 1", [tinyId])
    if (rows[0]) result.nftiResult = { type_code: rows[0].type_code, type_name: rows[0].type_name, mode: rows[0].mode }
  }
  if (result.hasHolland) {
    const [rows] = await pool.execute("SELECT type_code, type_name, mode FROM test_results WHERE tiny_id = ? AND assessment_type = 'holland' ORDER BY created_at DESC LIMIT 1", [tinyId])
    if (rows[0]) result.hollandResult = { type_code: rows[0].type_code, type_name: rows[0].type_name, mode: rows[0].mode }
  }
  return result
}

async function getStats() {
  const [[{ total_users }]] = await pool.execute('SELECT COUNT(*) AS total_users FROM users')
  const [[{ total_results }]] = await pool.execute('SELECT COUNT(*) AS total_results FROM test_results')
  const [[{ total_ai_chats }]] = await pool.execute('SELECT COUNT(*) AS total_ai_chats FROM ai_chats')
  const [appRow] = await pool.execute('SELECT counter, page_visits FROM app_stats WHERE id = 1')
  const counter = appRow[0]?.counter || 0
  const page_visits = appRow[0]?.page_visits || 0
  const [nftiRows] = await pool.execute("SELECT type_code, COUNT(*) AS cnt FROM test_results WHERE assessment_type='nfti' AND mode != 'quick' GROUP BY type_code")
  const [hollandRows] = await pool.execute("SELECT type_code, COUNT(*) AS cnt FROM test_results WHERE assessment_type='holland' GROUP BY type_code")
  const nfti_distribution = {}
  for (const r of nftiRows) nfti_distribution[r.type_code] = r.cnt
  const holland_distribution = {}
  for (const r of hollandRows) holland_distribution[r.type_code] = r.cnt
  return { total_users, total_results, total_ai_chats, counter, page_visits, nfti_distribution, holland_distribution }
}

/** 近 N 天按天聚合：nfti/holland 测试量 + 新增用户数（管理面板趋势图） */
async function getStatsTimeseries(days = 30) {
  const limit = Math.max(1, Math.min(parseInt(days, 10) || 30, 90))
  const since = `DATE_SUB(CURDATE(), INTERVAL ${limit - 1} DAY)`
  const byDate = new Map()
  const init = (d) => {
    if (!byDate.has(d)) byDate.set(d, { date: d, nfti_count: 0, holland_count: 0, new_users: 0 })
    return byDate.get(d)
  }
  const [resultRows] = await pool.execute(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, assessment_type, COUNT(*) AS cnt FROM test_results
     WHERE created_at >= ${since} GROUP BY DATE(created_at), assessment_type`
  )
  for (const r of resultRows) {
    const row = init(r.d)
    if (r.assessment_type === 'holland') row.holland_count = r.cnt
    else row.nfti_count = r.cnt
  }
  const [userRows] = await pool.execute(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COUNT(*) AS cnt FROM users
     WHERE created_at >= ${since} GROUP BY DATE(created_at)`
  )
  for (const r of userRows) {
    init(r.d).new_users = r.cnt
  }
  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** 最近测试记录（管理面板）：JOIN users 拿昵称 */
async function getTestRecords(limit = 30) {
  const max = Math.max(1, Math.min(parseInt(limit, 10) || 30, 100))
  const [rows] = await pool.execute(
    `SELECT tr.assessment_type, tr.mode, tr.type_code, tr.type_name,
            tr.tiny_id, tr.guest_id, tr.created_at, u.nick
     FROM test_results tr
     LEFT JOIN users u ON tr.tiny_id = u.tiny_id
     ORDER BY tr.created_at DESC
     LIMIT ?`,
    [max]
  )
  return rows.map(r => ({
    assessment_type: r.assessment_type,
    mode: r.mode,
    type_code: r.type_code,
    type_name: r.type_name,
    tiny_id: r.tiny_id,
    guest_id: r.guest_id,
    nick: r.nick || null,
    created_at: r.created_at,
  }))
}

// ─── 图鉴收集统计：全站每人的收集数分布（用于「超过 xx% 的用户」） ───
// 职业推荐算法统一走共享模块（与 db.js 降级路径、前端 careers.ts 公式一致）
const { recommendCareers } = require('./recommendCareers')

// 图鉴收集统计缓存（全表扫描成本高，TTL 5 分钟；有新结果写入时失效）
let collectionCache = null
let collectionCacheAt = 0
const COLLECTION_CACHE_TTL = 5 * 60 * 1000

function invalidateCollectionCache() {
  collectionCache = null
  collectionCacheAt = 0
}

/** 全站每人收集数：nfti 人格（非 quick 去重 type_code）+ 职业（重算推荐去重 title） */
async function getCollectionStats() {
  const nowTime = Date.now()
  if (collectionCache && nowTime - collectionCacheAt < COLLECTION_CACHE_TTL) {
    return collectionCache
  }
  const [rows] = await pool.execute(
    "SELECT tiny_id, guest_id, assessment_type, mode, type_code, scores FROM test_results"
  )
  const nftiPerUser = new Map()   // userKey -> Set<type_code>
  const careerPerUser = new Map() // userKey -> Set<career title>
  for (const r of rows) {
    const key = r.tiny_id || r.guest_id
    if (!key) continue
    if (r.assessment_type === 'holland') {
      const titles = recommendCareers(safeJsonParse(r.scores))
      if (!careerPerUser.has(key)) careerPerUser.set(key, new Set())
      for (const t of titles) careerPerUser.get(key).add(t)
    } else {
      if (r.mode === 'quick') continue
      if (!nftiPerUser.has(key)) nftiPerUser.set(key, new Set())
      nftiPerUser.get(key).add(r.type_code)
    }
  }
  const result = {
    nfti_counts: Array.from(nftiPerUser.values()).map(s => s.size),
    career_counts: Array.from(careerPerUser.values()).map(s => s.size),
  }
  collectionCache = result
  collectionCacheAt = Date.now()
  return result
}

async function incrementPageVisit() {
  await pool.execute(
    'INSERT INTO app_stats (id, counter, page_visits) VALUES (1, 0, 1) ON DUPLICATE KEY UPDATE page_visits = page_visits + 1'
  )
  const [rows] = await pool.execute('SELECT page_visits FROM app_stats WHERE id = 1')
  return rows[0]?.page_visits || 0
}

// ─── 邀请码系统 ───
async function generateInviteCodes(count = 1) {
  const created = []
  for (let i = 0; i < count; i++) {
    const code = 'NFBTI-' + crypto.randomBytes(4).toString('hex').toUpperCase()
    await pool.execute(
      'INSERT INTO invite_codes (code, used, multi_use) VALUES (?, 0, 0)',
      [code]
    )
    created.push(code)
  }
  return created
}

async function redeemInviteCode(code, fingerprint) {
  const [rows] = await pool.execute('SELECT * FROM invite_codes WHERE code = ?', [code])
  if (rows.length === 0) return { success: false, error: '邀请码无效' }
  const row = rows[0]
  // 超级码：不绑定浏览器，每次签发新 token
  if (row.multi_use) {
    const sessionToken = crypto.randomBytes(24).toString('hex')
    await pool.execute('UPDATE invite_codes SET session_token = ?, browser_fingerprint = ? WHERE code = ?', [sessionToken, fingerprint, code])
    return { success: true, nickname: '内测用户', sessionToken }
  }
  // 已绑定到当前浏览器 → 刷新 token 重新放行
  if (row.used && row.browser_fingerprint === fingerprint) {
    const sessionToken = crypto.randomBytes(24).toString('hex')
    await pool.execute('UPDATE invite_codes SET session_token = ?, used_at = NOW() WHERE code = ?', [sessionToken, code])
    return { success: true, nickname: '内测用户', sessionToken }
  }
  // 已绑定到其他浏览器 → 拒绝
  if (row.used) return { success: false, error: '邀请码已被其他设备使用' }
  // 首次使用：绑定指纹、签发 token
  const sessionToken = crypto.randomBytes(24).toString('hex')
  await pool.execute(
    'UPDATE invite_codes SET used = 1, browser_fingerprint = ?, session_token = ?, used_at = NOW() WHERE code = ?',
    [fingerprint, sessionToken, code]
  )
  return { success: true, nickname: '内测用户', sessionToken }
}

async function verifyBetaSession(sessionToken, fingerprint) {
  if (!sessionToken || !fingerprint) return { success: true, valid: false }
  const [rows] = await pool.execute(
    'SELECT code FROM invite_codes WHERE session_token = ? AND browser_fingerprint = ?',
    [sessionToken, fingerprint]
  )
  return { success: true, valid: rows.length > 0 }
}

async function listInviteCodes() {
  const [rows] = await pool.execute('SELECT * FROM invite_codes ORDER BY created_at DESC')
  return rows
}

/** 翻转邀请码 multi_use 超级码状态 */
async function updateInviteCode(code, multiUse) {
  const [result] = await pool.execute(
    'UPDATE invite_codes SET multi_use = ? WHERE code = ?',
    [multiUse ? 1 : 0, code]
  )
  return result.affectedRows > 0
}

/** 删除邀请码（管理操作，前端需二次确认） */
async function deleteInviteCode(code) {
  const [result] = await pool.execute('DELETE FROM invite_codes WHERE code = ?', [code])
  return result.affectedRows > 0
}

function safeJsonParse(value) {
  if (value == null) return value
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return value }
}

// ─── 交叉分析缓存 ───
async function saveCrossAnalysis(params) {
  const id = crypto.randomUUID()
  const { tiny_id, guest_id, nfti_code, holland_code, content } = params
  // 使用 INSERT ... ON DUPLICATE KEY 实现幂等
  await pool.execute(
    `INSERT INTO cross_analyses (id, tiny_id, guest_id, nfti_code, holland_code, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE content = VALUES(content), created_at = NOW()`,
    [id, tiny_id || null, guest_id || null, nfti_code, holland_code, content]
  )
  return { success: true }
}

async function getCrossAnalysis(params) {
  const { tiny_id, guest_id, nfti_code, holland_code } = params
  if (tiny_id) {
    const [rows] = await pool.execute(
      'SELECT content FROM cross_analyses WHERE tiny_id = ? AND nfti_code = ? AND holland_code = ? LIMIT 1',
      [tiny_id, nfti_code, holland_code]
    )
    return rows[0] || null
  }
  if (guest_id) {
    const [rows] = await pool.execute(
      'SELECT content FROM cross_analyses WHERE guest_id = ? AND nfti_code = ? AND holland_code = ? LIMIT 1',
      [guest_id, nfti_code, holland_code]
    )
    return rows[0] || null
  }
  return null
}

function normalizeResult(row) {
  row.scores = safeJsonParse(row.scores)
  row.answers = safeJsonParse(row.answers)
  return row
}

// ─── 默契度分享口令 ───
// 口令有效期（毫秒）：30 天自动停用（惰性判断，无定时任务）
const SHARE_CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * 生成/取回口令（幂等）：
 * - 该 result 已有未过期、未停用的口令 → 返回原口令（不重建）
 * - 已过期或已停用 → 覆盖生成新口令（重置 30 天）
 * 调用方保证 result 属于 owner_tiny_id。
 */
async function upsertShareCode({ resultId, tinyId, assessmentType, code }) {
  const existing = await getShareCodeByResultId(resultId)
  const nowMs = Date.now()
  // 统一返回 ISO UTC（带 Z），避免前端 new Date() 按本地时区解析偏移
  const iso = d => d.toISOString()
  if (existing) {
    const expired = new Date(existing.expires_at).getTime() < nowMs
    if (!expired && !existing.revoked) {
      return { code: existing.code, expires_at: iso(new Date(existing.expires_at)), recreated: false }
    }
    // 过期/停用 → 覆盖
    const expiresAt = new Date(nowMs + SHARE_CODE_TTL_MS)
    await pool.execute(
      `UPDATE share_codes SET code = ?, expires_at = ?, revoked = 0, assessment_type = ? WHERE result_id = ?`,
      [code, mysqlDate(expiresAt), assessmentType, resultId]
    )
    return { code, expires_at: iso(expiresAt), recreated: true }
  }
  const expiresAt = new Date(nowMs + SHARE_CODE_TTL_MS)
  try {
    await pool.execute(
      `INSERT INTO share_codes (code, result_id, owner_tiny_id, assessment_type, created_at, expires_at, revoked)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [code, resultId, tinyId, assessmentType, now(), mysqlDate(expiresAt)]
    )
  } catch (err) {
    // 并发冲突：同一 result 两个请求同时创建，唯一键兜底 → 重查返回已有口令
    if (err && err.code === 'ER_DUP_ENTRY') {
      const again = await getShareCodeByResultId(resultId)
      if (again) return { code: again.code, expires_at: iso(new Date(again.expires_at)), recreated: false }
    }
    throw err
  }
  return { code, expires_at: iso(expiresAt), recreated: true }
}

async function getShareCodeByResultId(resultId) {
  const [rows] = await pool.execute('SELECT * FROM share_codes WHERE result_id = ? LIMIT 1', [resultId])
  return rows[0] || null
}

/** 口令 + 结果摘要（不含 answers），供 redeem 与 share-list 使用 */
async function findShareWithResult(code) {
  const [rows] = await pool.execute(
    `SELECT s.code, s.result_id, s.owner_tiny_id, s.assessment_type, s.created_at, s.expires_at, s.revoked,
            r.type_code, r.type_name, r.scores, r.mode, r.tiny_id AS result_tiny_id,
            u.nick AS owner_nick
     FROM share_codes s
     LEFT JOIN test_results r ON r.id = s.result_id
     LEFT JOIN users u ON u.tiny_id = s.owner_tiny_id
     WHERE s.code = ? LIMIT 1`,
    [code]
  )
  if (!rows[0]) return null
  const row = rows[0]
  // 鲁棒：口令关联的测试结果已被删除 → 视为口令失效（前端显示"口令不存在"）
  if (!row.type_code) return null
  return {
    code: row.code,
    result_id: row.result_id,
    owner_tiny_id: row.owner_tiny_id,
    assessment_type: row.assessment_type,
    created_at: row.created_at,
    expires_at: row.expires_at,
    revoked: !!row.revoked,
    owner_nick: row.owner_nick || null,
    result: {
      id: row.result_id,
      assessment_type: row.assessment_type,
      type_code: row.type_code,
      type_name: row.type_name,
      scores: safeJsonParse(row.scores),
      mode: row.mode,
    },
  }
}

async function getShareCodesByOwner(tinyId) {
  const [rows] = await pool.execute(
    `SELECT s.code, s.result_id, s.assessment_type, s.created_at, s.expires_at, s.revoked,
            r.type_code, r.type_name,
            (SELECT COUNT(*) FROM match_results m WHERE m.share_code = s.code) AS match_count
     FROM share_codes s
     LEFT JOIN test_results r ON r.id = s.result_id
     WHERE s.owner_tiny_id = ?
     ORDER BY s.created_at DESC`,
    [tinyId]
  )
  return rows.map(r => ({
    code: r.code,
    result_id: r.result_id,
    assessment_type: r.assessment_type,
    created_at: r.created_at,
    expires_at: r.expires_at,
    revoked: !!r.revoked,
    type_code: r.type_code,
    type_name: r.type_name,
    match_count: Number(r.match_count || 0),
  }))
}

async function revokeShareCode(code, tinyId) {
  const [res] = await pool.execute(
    'UPDATE share_codes SET revoked = 1 WHERE code = ? AND owner_tiny_id = ?',
    [code, tinyId]
  )
  return res.affectedRows > 0
}

/** 拿某测试结果记录（供 share-create 校验归属） */
async function getTestResultById(resultId) {
  const [rows] = await pool.execute('SELECT * FROM test_results WHERE id = ? LIMIT 1', [resultId])
  return rows[0] ? normalizeResult(rows[0]) : null
}

// ─── 默契度结果缓存 ───
async function saveMatchResult({ shareCode, aTinyId, bTinyId, aResultId, bResultId, aAssessment, bAssessment, score, level, data, aiStory }) {
  const id = crypto.randomUUID()
  // 幂等：同一口令 + 同一对结果只保留一条
  await pool.execute(
    `INSERT INTO match_results (id, share_code, a_tiny_id, b_tiny_id, a_result_id, b_result_id, a_assessment, b_assessment, score, level, data, ai_story, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [id, shareCode, aTinyId, bTinyId, aResultId, bResultId, aAssessment, bAssessment, score, level, JSON.stringify(data || {}), aiStory || null, now()]
  )
  return getMatchByPair(shareCode, aResultId, bResultId)
}

async function getMatchByPair(shareCode, aResultId, bResultId) {
  const [rows] = await pool.execute(
    'SELECT * FROM match_results WHERE share_code = ? AND a_result_id = ? AND b_result_id = ? LIMIT 1',
    [shareCode, aResultId, bResultId]
  )
  if (!rows[0]) return null
  rows[0].data = safeJsonParse(rows[0].data)
  return rows[0]
}

/** 口令主人的配对记录（谁和我配对了） */
async function getMatchPairsByOwner(tinyId) {
  const [rows] = await pool.execute(
    `SELECT m.share_code, m.a_result_id, m.b_result_id, m.score, m.level, m.data, m.created_at,
            b.tiny_id AS b_tiny_id, u.nick AS b_nick
     FROM match_results m
     LEFT JOIN test_results b ON b.id = m.b_result_id
     LEFT JOIN users u ON u.tiny_id = b.tiny_id
     WHERE m.a_tiny_id = ?
     ORDER BY m.created_at DESC
     LIMIT 50`,
    [tinyId]
  )
  return rows.map(r => ({ ...r, data: safeJsonParse(r.data) }))
}

/** 更新 AI 剧本（缓存） */
async function updateMatchAiStory(shareCode, aResultId, bResultId, aiStory) {
  await pool.execute(
    'UPDATE match_results SET ai_story = ? WHERE share_code = ? AND a_result_id = ? AND b_result_id = ?',
    [aiStory, shareCode, aResultId, bResultId]
  )
  return true
}

/** 按 ID 读配对结果（含双方昵称/类型，持久化分享用） */
async function getMatchById(matchId) {
  const [rows] = await pool.execute(
    `SELECT m.id, m.share_code, m.score, m.level, m.data, m.ai_story, m.created_at,
            a.type_code AS a_type_code, a.type_name AS a_type_name,
            b.type_code AS b_type_code, b.type_name AS b_type_name,
            ua.nick AS a_nick, ub.nick AS b_nick
     FROM match_results m
     LEFT JOIN test_results a ON a.id = m.a_result_id
     LEFT JOIN test_results b ON b.id = m.b_result_id
     LEFT JOIN users ua ON ua.tiny_id = a.tiny_id
     LEFT JOIN users ub ON ub.tiny_id = b.tiny_id
     WHERE m.id = ? LIMIT 1`,
    [matchId]
  )
  if (!rows[0]) return null
  const r = rows[0]
  return {
    id: r.id,
    share_code: r.share_code,
    score: r.score,
    level: r.level,
    data: safeJsonParse(r.data),
    ai_story: r.ai_story,
    created_at: r.created_at,
    a_nick: r.a_nick || null,
    a_type_code: r.a_type_code || '',
    a_type_name: r.a_type_name || r.a_type_code || '',
    b_nick: r.b_nick || null,
    b_type_code: r.b_type_code || '',
    b_type_name: r.b_type_name || r.b_type_code || '',
  }
}

/** MySQL 时间格式化：Date → 'YYYY-MM-DD HH:mm:ss' */
function mysqlDate(d) {
  return d.toISOString().replace('T', ' ').replace('Z', '')
}

module.exports = {
  initDb, findOrCreateUser, findUserByTinyId,
  saveTestResult, getTestResultsByUser, getTestResultsByTinyId, getTestResultsByGuestId, getLatestTestResult,
  saveAiChat, updateAiChat, getAiChatByUser,
  incrementCounter, getCounter, setCounter, incrementPageVisit, getCrossCheck, getStats, getCollectionStats,
  generateInviteCodes, redeemInviteCode, listInviteCodes, verifyBetaSession,
  getStatsTimeseries, updateInviteCode, deleteInviteCode, getTestRecords,
  saveCrossAnalysis, getCrossAnalysis,
  upsertShareCode, getShareCodeByResultId, findShareWithResult, getShareCodesByOwner,
  revokeShareCode, getTestResultById,
  saveMatchResult, getMatchByPair, getMatchPairsByOwner, updateMatchAiStory, getMatchById,
}
