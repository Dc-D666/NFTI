// 霍兰德职业兴趣测评 · 类型定义
// 六种维度 RIASEC

export type HollandDimension = 'R' | 'I' | 'A' | 'S' | 'E' | 'C'

// 六维分数
export type HollandScores = Record<HollandDimension, number>

// 校园角色定义
export interface HollandRole {
  dimension: HollandDimension
  name: string          // 校园版名称，如「工匠」
  emoji: string         // 如 🔧
  description: string   // 角色描述
  suitableClubs: string[]  // 适合的社团
  suitableDirections: string[] // 推荐方向
}

// 职业推荐
export interface CareerRecommendation {
  title: string
  category: string
  reason: string
  source: HollandDimension
  /** 六维需求权重（1-5），用于余弦相似度匹配 */
  weights: HollandScores
}

// 完整测评结果
export interface HollandResult {
  code: string            // 三位代码，如 "SIA"
  primary: HollandDimension
  secondary: HollandDimension
  tertiary: HollandDimension
  scores: HollandScores
  roles: [HollandRole, HollandRole, HollandRole]
  summary: string
  southSchool?: { label: string; emoji?: string; story: string } | null
  careers: CareerRecommendation[]  // 职业推荐
  /** 用户对所有题目选了完全相同的选项（全 1 / 全 3 / 全 5 等），结果不可用 */
  isNonSerious?: boolean
  /** 并列维度提示：如 ['R = I']，表示同分时按 R→I→A→S→E→C 定义序排列 */
  ties?: string[]
}
