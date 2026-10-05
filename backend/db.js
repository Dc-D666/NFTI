const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { recommendCareers } = require('./recommendCareers')

const DB_PATH = path.join(__dirname, 'data', 'nfti.db.json')

function ensureDir() {
  const dir = path.dirname(DB_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readDb() {
  ensureDir()
  if (!fs.existsSync(DB_PATH)) {
    const initial = { users: [], test_results: [], ai_chats: [], counter: 0, page_visits: 0 }
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2))
    return initial
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
}

function writeDb(data) {
  ensureDir()
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
}

function findOrCreateUser(params) {
  const db = readDb()
  let user = db.users.find(u => u.tiny_id === params.tiny_id)
  if (!user && params.tiny_id) {
    user = {
      id: crypto.randomUUID(), tiny_id: params.tiny_id, nick: params.nick || null,
      gender: params.gender || null, province: params.province || null, country: params.country || null,
      avatar_url: params.avatar_url || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    db.users.push(user)
    writeDb(db)
  } else if (user) {
    if (params.nick) user.nick = params.nick
    user.updated_at = new Date().toISOString()
    writeDb(db)
  }
  return user
}

function findUserByTinyId(tinyId) {
  const db = readDb()
  return db.users.find(u => u.tiny_id === tinyId) || null
}

function saveTestResult(params) {
  const db = readDb()
  const result = {
    id: crypto.randomUUID(), user_id: params.user_id || null, tiny_id: params.tiny_id || null, guest_id: params.guest_id || null,
    assessment_type: params.assessment_type || 'nfti',
    mode: params.mode, type_code: params.type_code, type_name: params.type_name,
    scores: params.scores, answers: params.answers || [], created_at: new Date().toISOString(),
  }
  db.test_results.push(result)
  writeDb(db)
  return result
}

function getTestResultsByUser(userId) {
  const db = readDb()
  return db.test_results.filter(r => r.user_id === userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

function getTestResultsByTinyId(tinyId) {
  const db = readDb()
  return db.test_results.filter(r => r.tiny_id === tinyId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

function getTestResultsByGuestId(guestId) {
  const db = readDb()
  return db.test_results.filter(r => r.guest_id === guestId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

function getLatestTestResult(userId) {
  const db = readDb()
  const results = db.test_results.filter(r => r.user_id === userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return results[0] || null
}

// ─── 默契度分享（内存版）───
const SHARE_CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000

function getTestResultById(resultId) {
  const db = readDb()
  return db.test_results.find(r => r.id === resultId) || null
}

function getShareCodeByResultId(resultId) {
  const db = readDb()
  return (db.share_codes || []).find(s => s.result_id === resultId) || null
}

function upsertShareCode({ resultId, tinyId, assessmentType, code }) {
  const db = readDb()
  if (!db.share_codes) db.share_codes = []
  const existing = getShareCodeByResultId(resultId)
  const expiresAt = new Date(Date.now() + SHARE_CODE_TTL_MS).toISOString()
  if (existing) {
    const expired = new Date(existing.expires_at).getTime() < Date.now()
    if (!expired && !existing.revoked) {
      return { code: existing.code, expires_at: existing.expires_at, recreated: false }
    }
    existing.code = code; existing.expires_at = expiresAt; existing.revoked = 0
    writeDb(db)
    return { code, expires_at: expiresAt, recreated: true }
  }
  db.share_codes.push({
    code, result_id: resultId, owner_tiny_id: tinyId, assessment_type: assessmentType,
    created_at: new Date().toISOString(), expires_at: expiresAt, revoked: 0,
  })
  writeDb(db)
  return { code, expires_at: expiresAt, recreated: true }
}

function findShareWithResult(code) {
  const db = readDb()
  const s = (db.share_codes || []).find(x => x.code === code)
  if (!s) return null
  const r = db.test_results.find(x => x.id === s.result_id)
  const u = db.users.find(x => x.tiny_id === s.owner_tiny_id)
  return {
    code: s.code, result_id: s.result_id, owner_tiny_id: s.owner_tiny_id,
    assessment_type: s.assessment_type, created_at: s.created_at, expires_at: s.expires_at,
    revoked: !!s.revoked, owner_nick: u ? u.nick : null,
    result: r ? { id: r.id, assessment_type: r.assessment_type, type_code: r.type_code, type_name: r.type_name, scores: r.scores || {}, mode: r.mode } : null,
  }
}

function getShareCodesByOwner(tinyId) {
  const db = readDb()
  return (db.share_codes || [])
    .filter(s => s.owner_tiny_id === tinyId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(s => {
      const r = db.test_results.find(x => x.id === s.result_id)
      const matchCount = (db.match_results || []).filter(m => m.share_code === s.code).length
      return {
        code: s.code, result_id: s.result_id, assessment_type: s.assessment_type,
        created_at: s.created_at, expires_at: s.expires_at, revoked: !!s.revoked,
        type_code: r ? r.type_code : null, type_name: r ? r.type_name : null, match_count: matchCount,
      }
    })
}

function revokeShareCode(code, tinyId) {
  const db = readDb()
  const s = (db.share_codes || []).find(x => x.code === code && x.owner_tiny_id === tinyId)
  if (!s) return false
  s.revoked = 1
  writeDb(db)
  return true
}

function saveMatchResult({ shareCode, aTinyId, bTinyId, aResultId, bResultId, aAssessment, bAssessment, score, level, data, aiStory }) {
  const db = readDb()
  if (!db.match_results) db.match_results = []
  const existing = db.match_results.find(m => m.share_code === shareCode && m.a_result_id === aResultId && m.b_result_id === bResultId)
  if (existing) {
    existing.score = score; existing.level = level; existing.data = data; existing.ai_story = aiStory || existing.ai_story
    writeDb(db)
    return existing
  }
  const row = {
    id: crypto.randomUUID(), share_code: shareCode, a_tiny_id: aTinyId, b_tiny_id: bTinyId,
    a_result_id: aResultId, b_result_id: bResultId, a_assessment: aAssessment, b_assessment: bAssessment,
    score, level, data, ai_story: aiStory || null, created_at: new Date().toISOString(),
  }
  db.match_results.push(row)
  writeDb(db)
  return row
}

function getMatchByPair(shareCode, aResultId, bResultId) {
  const db = readDb()
  return (db.match_results || []).find(m => m.share_code === shareCode && m.a_result_id === aResultId && m.b_result_id === bResultId) || null
}

function getMatchPairsByOwner(tinyId) {
  const db = readDb()
  return (db.match_results || [])
    .filter(m => m.a_tiny_id === tinyId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 50)
    .map(m => {
      const b = db.test_results.find(x => x.id === m.b_result_id)
      const bu = b ? db.users.find(x => x.tiny_id === b.tiny_id) : null
      return { ...m, b_tiny_id: b ? b.tiny_id : null, b_nick: bu ? bu.nick : null }
    })
}

function updateMatchAiStory(shareCode, aResultId, bResultId, aiStory) {
  const db = readDb()
  const m = (db.match_results || []).find(x => x.share_code === shareCode && x.a_result_id === aResultId && x.b_result_id === bResultId)
  if (m) { m.ai_story = aiStory; writeDb(db) }
  return true
}

/** 按 ID 读配对结果（含双方昵称/类型，持久化分享用） */
function getMatchById(matchId) {
  const db = readDb()
  const m = (db.match_results || []).find(x => x.id === matchId)
  if (!m) return null
  const a = db.test_results.find(x => x.id === m.a_result_id)
  const b = db.test_results.find(x => x.id === m.b_result_id)
  const ua = a ? db.users.find(x => x.tiny_id === a.tiny_id) : null
  const ub = b ? db.users.find(x => x.tiny_id === b.tiny_id) : null
  return {
    id: m.id,
    share_code: m.share_code,
    score: m.score,
    level: m.level,
    data: m.data || {},
    ai_story: m.ai_story || null,
    created_at: m.created_at,
    a_nick: ua ? ua.nick : null,
    a_type_code: a ? a.type_code : '',
    a_type_name: a ? a.type_name || a.type_code : '',
    b_nick: ub ? ub.nick : null,
    b_type_code: b ? b.type_code : '',
    b_type_name: b ? b.type_name || b.type_code : '',
  }
}

function saveAiChat(params) {
  const db = readDb()
  const chat = {
    id: crypto.randomUUID(), user_id: params.userId || null, tiny_id: params.tiny_id || null,
    messages: params.messages || [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  db.ai_chats.push(chat)
  writeDb(db)
  return chat
}

function updateAiChat(userId, messages) {
  const db = readDb()
  const chat = db.ai_chats.find(c => c.user_id === userId)
  if (chat) {
    chat.messages = messages
    chat.updated_at = new Date().toISOString()
    writeDb(db)
  }
  return chat
}

function getAiChatByUser(userId) {
  const db = readDb()
  return db.ai_chats.find(c => c.user_id === userId) || null
}

function incrementCounter() {
  const db = readDb()
  db.counter = (db.counter || 0) + 1
  writeDb(db)
  return db.counter
}

function getCounter() {
  const db = readDb()
  return db.counter || 0
}

function getStats() {
  const db = readDb()
  const nftiDist = {}
  const hollandDist = {}
  for (const r of db.test_results) {
    if (r.mode === 'quick') continue
    // 与 MySQL 版口径一致：holland 显式区分，其余（含缺字段旧数据）按 nfti 计
    const dist = r.assessment_type === 'holland' ? hollandDist : nftiDist
    dist[r.type_code] = (dist[r.type_code] || 0) + 1
  }
  return {
    total_users: db.users.length, total_results: db.test_results.length,
    total_ai_chats: db.ai_chats.length, counter: db.counter || 0,
    page_visits: db.page_visits || 0,
    nfti_distribution: nftiDist,
    holland_distribution: hollandDist,
  }
}

/** 全站每人收集数分布（SQLite 降级版：从 JSON 内存数据计算）
 * 与 MySQL 版口径一致：holland 记录按 scores 重算职业 title 去重，nfti 记录排除 quick 去重 code
 */
function getCollectionStats() {
  const db = readDb()
  const nftiPerUser = new Map()
  const careerPerUser = new Map()
  for (const r of db.test_results || []) {
    const key = r.tiny_id || r.guest_id
    if (!key) continue
    if (r.assessment_type === 'holland') {
      const titles = recommendCareers(r.scores)
      if (!careerPerUser.has(key)) careerPerUser.set(key, new Set())
      for (const t of titles) careerPerUser.get(key).add(t)
    } else {
      if (r.mode === 'quick') continue
      if (!nftiPerUser.has(key)) nftiPerUser.set(key, new Set())
      nftiPerUser.get(key).add(r.type_code)
    }
  }
  return {
    nfti_counts: Array.from(nftiPerUser.values()).map(s => s.size),
    career_counts: Array.from(careerPerUser.values()).map(s => s.size),
  }
}

function getCrossCheck(tinyId) {
  const db = readDb()
  // 与 MySQL 版口径一致：严格按 assessment_type 区分（旧数据缺字段时按 'nfti' 兜底）
  const nftiResults = db.test_results.filter(r => r.tiny_id === tinyId && (r.assessment_type || 'nfti') === 'nfti')
  const hollandResults = db.test_results.filter(r => r.tiny_id === tinyId && r.assessment_type === 'holland')
  const result = { hasNfti: nftiResults.length > 0, hasHolland: hollandResults.length > 0 }
  if (result.hasNfti) {
    const latest = nftiResults.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
    result.nftiResult = { type_code: latest.type_code, type_name: latest.type_name, mode: latest.mode }
  }
  if (result.hasHolland) {
    const latest = hollandResults.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
    result.hollandResult = { type_code: latest.type_code, type_name: latest.type_name, mode: latest.mode }
  }
  return result
}

function incrementPageVisit() {
  const db = readDb()
  db.page_visits = (db.page_visits || 0) + 1
  writeDb(db)
  return db.page_visits
}

// ─── 邀请码系统（SQLite 降级版，字段与 MySQL 版对齐） ───
function generateInviteCodes(count = 1) {
  const db = readDb()
  if (!db.invite_codes) db.invite_codes = []
  const created = []
  for (let i = 0; i < count; i++) {
    const code = 'NFBTI-' + crypto.randomBytes(4).toString('hex').toUpperCase()
    db.invite_codes.push({ code, used: 0, multi_use: 0, browser_fingerprint: null, session_token: null, used_at: null, created_at: new Date().toISOString() })
    created.push(code)
  }
  writeDb(db)
  return created
}

function redeemInviteCode(code, fingerprint) {
  const db = readDb()
  if (!db.invite_codes) db.invite_codes = []
  const row = db.invite_codes.find(c => c.code === code)
  if (!row) return { success: false, error: '邀请码无效' }
  const sessionToken = crypto.randomBytes(24).toString('hex')
  if (row.multi_use) {
    row.session_token = sessionToken
    row.browser_fingerprint = fingerprint
    writeDb(db)
    return { success: true, nickname: '内测用户', sessionToken }
  }
  if (row.used && row.browser_fingerprint === fingerprint) {
    row.session_token = sessionToken
    row.used_at = new Date().toISOString()
    writeDb(db)
    return { success: true, nickname: '内测用户', sessionToken }
  }
  if (row.used) return { success: false, error: '邀请码已被其他设备使用' }
  row.used = 1
  row.browser_fingerprint = fingerprint
  row.session_token = sessionToken
  row.used_at = new Date().toISOString()
  writeDb(db)
  return { success: true, nickname: '内测用户', sessionToken }
}

function listInviteCodes() {
  const db = readDb()
  if (!db.invite_codes) return []
  return [...db.invite_codes].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

function verifyBetaSession(sessionToken, fingerprint) {
  if (!sessionToken || !fingerprint) return { success: true, valid: false }
  const db = readDb()
  const row = (db.invite_codes || []).find(c => c.session_token === sessionToken && c.browser_fingerprint === fingerprint)
  return { success: true, valid: !!row }
}

/** 近 N 天按天聚合（JSON 降级路径，逻辑与 db.mysql.js 对齐） */
function getStatsTimeseries(days = 30) {
  const db = readDb()
  const limit = Math.max(1, Math.min(parseInt(days, 10) || 30, 90))
  const byDate = new Map()
  const init = (d) => {
    if (!byDate.has(d)) byDate.set(d, { date: d, nfti_count: 0, holland_count: 0, new_users: 0 })
    return byDate.get(d)
  }
  const dayKey = (iso) => String(iso || '').slice(0, 10)
  for (const r of db.test_results || []) {
    const d = dayKey(r.created_at)
    if (!d) continue
    const row = init(d)
    if (r.assessment_type === 'holland') row.holland_count++
    else row.nfti_count++
  }
  for (const u of db.users || []) {
    const d = dayKey(u.created_at)
    if (d) init(d).new_users++
  }
  const now = Date.now()
  return Array.from(byDate.values())
    .filter(p => {
      const age = (now - new Date(p.date).getTime()) / 86400000
      return age >= 0 && age < limit
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

function updateInviteCode(code, multiUse) {
  const db = readDb()
  const target = String(code || '').toUpperCase()
  const row = (db.invite_codes || []).find(c => String(c.code || '').toUpperCase() === target)
  if (!row) return false
  row.multi_use = multiUse ? 1 : 0
  writeDb(db)
  return true
}

function deleteInviteCode(code) {
  const db = readDb()
  const target = String(code || '').toUpperCase()
  const before = (db.invite_codes || []).length
  db.invite_codes = (db.invite_codes || []).filter(c => String(c.code || '').toUpperCase() !== target)
  if (db.invite_codes.length === before) return false
  writeDb(db)
  return true
}

/** 最近测试记录（JSON 降级路径，逻辑与 db.mysql.js 对齐） */
function getTestRecords(limit = 30) {
  const db = readDb()
  const max = Math.max(1, Math.min(parseInt(limit, 10) || 30, 100))
  const nickByTiny = new Map((db.users || []).map(u => [u.tiny_id, u.nick]))
  return (db.test_results || [])
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, max)
    .map(r => ({
      assessment_type: r.assessment_type,
      mode: r.mode,
      type_code: r.type_code,
      type_name: r.type_name,
      tiny_id: r.tiny_id,
      guest_id: r.guest_id,
      nick: nickByTiny.get(r.tiny_id) || null,
      created_at: r.created_at,
    }))
}

module.exports = {
  findOrCreateUser, findUserByTinyId,
  saveTestResult, getTestResultsByUser, getTestResultsByTinyId, getTestResultsByGuestId, getLatestTestResult,
  saveAiChat, updateAiChat, getAiChatByUser,
  incrementCounter, getCounter, incrementPageVisit, getCrossCheck, getStats, getCollectionStats,
  generateInviteCodes, redeemInviteCode, listInviteCodes, verifyBetaSession,
  getStatsTimeseries, updateInviteCode, deleteInviteCode, getTestRecords,
  upsertShareCode, getShareCodeByResultId, findShareWithResult, getShareCodesByOwner,
  revokeShareCode, getTestResultById,
  saveMatchResult, getMatchByPair, getMatchPairsByOwner, updateMatchAiStory, getMatchById,
}
