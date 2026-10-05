/**
 * 默契度算法（match.js）
 * - NFTI × NFTI：四维轴向量（E-I / S-N / T-F / J-P）相似度 + 互补度加权，
 *   再按人格关系表（绝配/天敌）修正，隐藏款加成
 * - Holland × Holland：RIASEC 六维分数余弦相似度
 * - 跨类型（NFTI × Holland）：规则基础分（无直接可比维度）
 * - 产出：score(0-100)、level、data（维度明细 + 组合键），供前端渲染称号/推荐
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 32 字符，无 I/O/0/1（防混淆）

/** 生成口令：前缀(2位大写) + 8 位随机码（40bit） */
function generateShareCode(prefix) {
  const rand = []
  for (let i = 0; i < 8; i++) rand.push(CODE_ALPHABET[cryptoRandomInt(CODE_ALPHABET.length)])
  return `${prefix}-${rand.slice(0, 4).join('')}-${rand.slice(4).join('')}`
}

function cryptoRandomInt(max) {
  // 无 crypto.randomInt 依赖的兼容实现（Node >=14 均有，此处直接使用）
  return require('crypto').randomInt(max)
}

// ─── 默契等级（校园化）───
const LEVELS = [
  { min: 90, key: 'soulmate', name: '天作之合' },
  { min: 80, key: 'partner', name: '默契搭档' },
  { min: 65, key: 'acquaintance', name: '点头之交' },
  { min: 0, key: 'stranger', name: '路人' },
]

function levelOf(score) {
  return LEVELS.find(l => score >= l.min) || LEVELS[LEVELS.length - 1]
}

// ─── NFTI 人格关系表（绝配/天敌/专克，与前端 data/relationships.ts 完全一致）───
// 2026-08 审查：SEWOO/SCHEMER/WEEKLY/MEOW/DASI 五处此前凭记忆写错，已按前端权威数据对齐
const NFTI_RELATIONS = {
  HEAD: { 绝配: ['DORM'], 天敌: ['BANDIT'], 专克: ['PUPPY'] },
  MILKTEA: { 绝配: ['GENIUS'], 天敌: ['MONITOR'], 专克: ['LEADER'] },
  JIAHAO: { 绝配: ['DASI'], 天敌: ['SCHEMER'], 专克: ['HEAD'] },
  BANDIT: { 绝配: ['SPOILER'], 天敌: ['HEAD'], 专克: ['ZXF'] },
  SPOILER: { 绝配: ['BANDIT'], 天敌: ['GENIUS'], 专克: ['TOOLBOX'] },
  PUPPY: { 绝配: ['DREAMER'], 天敌: ['MONITOR'], 专克: ['HEAD'] },
  LEADER: { 绝配: ['SCHEMER'], 天敌: ['JIAHAO'], 专克: ['MILKTEA'] },
  ZXF: { 绝配: ['SCHEMER'], 天敌: ['DREAMER'], 专克: ['BANDIT'] },
  GENIUS: { 绝配: ['MILKTEA'], 天敌: ['SPOILER'], 专克: ['WEEKLY'] },
  DORM: { 绝配: ['HEAD'], 天敌: ['JIAHAO'], 专克: ['SEWOO'] },
  DREAMER: { 绝配: ['PUPPY'], 天敌: ['ZXF'], 专克: ['MONITOR'] },
  MONITOR: { 绝配: ['TOOLBOX'], 天敌: ['PUPPY'], 专克: ['DREAMER'] },
  TOOLBOX: { 绝配: ['MONITOR'], 天敌: ['SPOILER'], 专克: ['SEWOO'] },
  SEWOO: { 绝配: ['TOOLBOX'], 天敌: ['LEADER'], 专克: ['DORM'] },
  SCHEMER: { 绝配: ['LEADER'], 天敌: ['JIAHAO'], 专克: ['WEEKLY'] },
  WEEKLY: { 绝配: ['DREAMER'], 天敌: ['LEADER'], 专克: ['GENIUS'] },
  MEOW: { 绝配: ['DREAMER'], 天敌: ['OG'], 专克: ['PUPPY'] },
  DASI: { 绝配: ['JIAHAO'], 天敌: ['BANDIT'], 专克: ['HEAD'] },
  '####': { 绝配: [], 天敌: [], 专克: [] },
}
const HIDDEN_TYPES = new Set(['MEOW', 'DASI', '####'])

function nftiRelationAdjust(codeA, codeB) {
  const relA = NFTI_RELATIONS[codeA]
  if (!relA) return 0
  if ((relA.绝配 || []).includes(codeB)) return 10
  if ((relA.天敌 || []).includes(codeB)) return -10
  if ((relA.专克 || []).includes(codeB)) return -5
  return 0
}

// ─── 向量工具 ───
function cosine(a, b) {
  if (!a.length || !b.length || a.length !== b.length) return 0.5
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0.5
  return dot / (Math.sqrt(na) * Math.sqrt(nb)) // -1..1
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

/** NFTI 四维轴向量：每轴 E-I / S-N / T-F / J-P */
function nftiAxis(scores) {
  return [
    (scores.E || 0) - (scores.I || 0),
    (scores.S || 0) - (scores.N || 0),
    (scores.T || 0) - (scores.F || 0),
    (scores.J || 0) - (scores.P || 0),
  ]
}

function computeNftiMatch(a, b) {
  const ax = nftiAxis(a.scores)
  const bx = nftiAxis(b.scores)
  // 相似度：同向程度；互补度：反向程度（a 与 -b 的夹角）
  const sim = (cosine(ax, bx) + 1) / 2 // 0..1
  const negB = bx.map(v => -v)
  const comp = (cosine(ax, negB) + 1) / 2 // 0..1
  // 契合度 = 同频或互补皆算默契（取较大者），杜绝"相似才高分"的偏科
  const harmony = Math.max(sim, comp)
  let score = harmony * 100
  // 关系修正：绝配/天敌/专克（双向）
  score += nftiRelationAdjust(a.typeCode, b.typeCode) + nftiRelationAdjust(b.typeCode, a.typeCode)
  // 隐藏款稀有加成（双方都隐藏 +8，单方 +4）
  if (HIDDEN_TYPES.has(a.typeCode) && HIDDEN_TYPES.has(b.typeCode)) score += 8
  else if (HIDDEN_TYPES.has(a.typeCode) || HIDDEN_TYPES.has(b.typeCode)) score += 4

  const final = Math.round(clamp(score, 5, 98))
  const level = levelOf(final)
  const dimNames = ['social', 'info', 'decision', 'rhythm']
  const dims = {}
  ax.forEach((_, i) => {
    const s = simOfAxis(ax[i], bx[i])
    dims[dimNames[i]] = { sim: s, comp: 100 - s, harmony: Math.max(s, 100 - s) }
  })
  return {
    score: final,
    level: level.key,
    levelName: level.name,
    comboKey: [a.typeCode, b.typeCode].sort().join('x'),
    data: {
      algorithm: 'nfti',
      sim: Math.round(sim * 100),
      comp: Math.round(comp * 100),
      harmony: Math.round(harmony * 100),
      dims,
      aCode: a.typeCode,
      bCode: b.typeCode,
    },
  }
}

/** 单轴相似度：0(完全相反)..100(完全相同)，按差值归一 */
function simOfAxis(da, db) {
  const diff = Math.abs(da - db)
  const span = 48 // 轴值理论最大跨度（单维 ±24）
  return Math.round(clamp(100 - (diff / span) * 100, 0, 100))
}

// RIASEC 六角环（Holland 标准顺序）：相邻=兴趣相近，对面=差异最大
const HOLLAND_RING = ['R', 'I', 'A', 'S', 'E', 'C']

/** 六角环距离：0(同) / 1(相邻) / 2(隔一) / 3(对面)；非法返回 -1 */
function hollandRingDist(x, y) {
  if (!x || !y) return -1
  const i = HOLLAND_RING.indexOf(x)
  const j = HOLLAND_RING.indexOf(y)
  if (i < 0 || j < 0) return -1
  const d = Math.abs(i - j)
  return Math.min(d, 6 - d)
}

/** 六角环一致性修正（主/次/三代码按权重 0.6/0.3/0.1） */
function hollandRingAdjust(codeA, codeB) {
  const f = d => (d === 0 ? 8 : d === 1 ? 0 : d === 2 ? -8 : -18)
  const weights = [0.6, 0.3, 0.1]
  let total = 0
  for (let k = 0; k < 3; k++) {
    const d = hollandRingDist(codeA[k], codeB[k])
    if (d >= 0) total += weights[k] * f(d)
  }
  return Math.round(total)
}

function computeHollandMatch(a, b) {
  const dims = ['R', 'I', 'A', 'S', 'E', 'C']
  const av = dims.map(d => a.scores[d] || 0)
  const bv = dims.map(d => b.scores[d] || 0)
  // 中心化（减均值）：消除"答题风格整体偏高/偏低"对相似度的虚高影响，
  // 保留真实兴趣形状；否则两个兴趣相反的用户因分数同高同低也会拿到 90+
  const center = v => {
    const m = v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0
    return v.map(x => x - m)
  }
  const ac = center(av)
  const bc = center(bv)
  const sim = (cosine(ac, bc) + 1) / 2
  let score = sim * 100
  // 六角环一致性修正（同码 +8 / 相邻 0 / 隔一 -8 / 对面 -18，主次三码加权）
  score += hollandRingAdjust(a.typeCode || '', b.typeCode || '')
  const final = Math.round(clamp(score, 5, 98))
  const level = levelOf(final)
  return {
    score: final,
    level: level.key,
    levelName: level.name,
    comboKey: [a.typeCode, b.typeCode].sort().join('x'),
    data: {
      algorithm: 'holland',
      sim: Math.round(sim * 100),
      aCode: a.typeCode,
      bCode: b.typeCode,
    },
  }
}

/**
 * 统一入口：
 * a/b: { assessment_type, type_code, type_name, scores }
 */
function computeMatch(a, b) {
  // 字段归一化：兼容 type_code / typeCode 两种写法
  const norm = x => ({
    assessment_type: x.assessment_type || 'nfti',
    typeCode: x.type_code || x.typeCode || '',
    typeName: x.type_name || x.typeName || x.typeCode || '',
    scores: x.scores || {},
  })
  const A = norm(a)
  const B = norm(b)
  if (A.assessment_type === 'nfti' && B.assessment_type === 'nfti') return computeNftiMatch(A, B)
  if (A.assessment_type === 'holland' && B.assessment_type === 'holland') return computeHollandMatch(A, B)
  // 跨类型：无直接可比维度 → 规则基础分（隐藏款加成）
  let score = 60
  if (HIDDEN_TYPES.has(A.typeCode) || HIDDEN_TYPES.has(B.typeCode)) score += 6
  const final = Math.round(clamp(score, 5, 98))
  const level = levelOf(final)
  return {
    score: final,
    level: level.key,
    levelName: level.name,
    comboKey: [A.typeCode, B.typeCode].sort().join('x'),
    data: {
      algorithm: 'mixed',
      aType: A.assessment_type,
      bType: B.assessment_type,
      aCode: A.typeCode,
      bCode: B.typeCode,
    },
  }
}

/** 按 level key 取等级名（缓存命中时响应补全用） */
function levelNameOf(key) {
  const l = LEVELS.find(x => x.key === key)
  return l ? l.name : key
}

module.exports = { computeMatch, generateShareCode, levelOf, levelNameOf }
