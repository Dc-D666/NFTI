// 职业推荐算法共享模块
// 与前端 frontend/src/assessments/holland/careers.ts 的 generateRecommendations 保持一致的公式：
//   70% 余弦相似度 + 30% 主维度锚定，返回前 8 个职业 title
// db.mysql.js 与 db.js（SQLite 降级）都引用本模块，避免两端算法漂移。
const path = require('path')

const DIM_ORDER = ['R', 'I', 'A', 'S', 'E', 'C']

// 职业池：与前端 careers.ts 同源（backend/data/careers.data.json）
const careerPool = (() => {
  try { return require(path.join(__dirname, 'data', 'careers.data.json')) } catch { return [] }
})()

function careerVec(w) {
  return DIM_ORDER.map(d => Number(w?.[d]) || 0)
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0
    const bi = b[i] ?? 0
    dot += ai * bi
    normA += ai * ai
    normB += bi * bi
  }
  if (normA === 0 || normB === 0) return 0
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom > 0 ? dot / denom : 0
}

/** 与前端 generateRecommendations 一致：70% 余弦 + 30% 主维度锚定，返回前 8 个职业 title */
function recommendCareers(scores) {
  if (!scores) return []
  const userVec = careerVec(scores)
  const scored = careerPool.map(c => {
    const cos = cosineSimilarity(userVec, careerVec(c.weights))
    const dimScore = (Number(scores[c.source]) || 0) / 40
    return { c, sim: cos * 0.7 + dimScore * 0.3 }
  })
  scored.sort((a, b) => b.sim - a.sim)
  return scored.slice(0, 8).map(s => s.c.title)
}

module.exports = { recommendCareers, careerPool, DIM_ORDER }
