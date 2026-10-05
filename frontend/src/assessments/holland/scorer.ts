// 霍兰德职业测评 · 计分器（v3）
// 48 题纯 Likert 1-5，每维 8 题直接加总（8-40 分）
import type { UserAnswers } from '@/types'
import type { HollandDimension, HollandScores, HollandResult } from '@/types/holland'
import { hollandQuestions } from './questions'
import { getTopRoles, getSouthSchoolName } from './roles'
import { generateRecommendations } from './careers'

const DIM_NAMES: Record<HollandDimension, string> = {
  R: '动手', I: '研究', A: '创作', S: '共情', E: '推动', C: '条理',
}

export function calculateHolland(answers: UserAnswers): HollandResult {
  // 直接加总每维分数
  const scores: HollandScores = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 }
  const allValues: number[] = []
  for (const q of hollandQuestions) {
    const raw = answers[q.id]
    if (raw !== undefined && raw >= 1 && raw <= 5) {
      const val = q.reversed ? 6 - raw : raw
      scores[q.dimension] += val
      allValues.push(raw)
    }
  }

  // 检测非认真作答：所有题目选了完全相同的选项（全 1 / 全 3 / 全 5 等）
  const isNonSerious = allValues.length >= 48 && allValues.every(v => v === allValues[0])

  // 排序取前三。
  // 注意：Object.entries 的迭代顺序为定义序 (R→I→A→S→E→C)，ES2019+
  // 稳定排序下同分元素保持该顺序——这是数据结构的机械副产物，非主观偏好。
  // 在 8-40 分范围内，六维完全同分若非全同答案导致，概率极低。
  const sorted = (Object.entries(scores) as [HollandDimension, number][])
    .sort((a, b) => b[1] - a[1])

  const primary = sorted[0]?.[0] ?? 'R'
  const secondary = sorted[1]?.[0] ?? 'I'
  const tertiary = sorted[2]?.[0] ?? 'A'
  const code = primary + secondary + tertiary

  // 并列检测：同分时按 R→I→A→S→E→C 定义序稳定排序，这里把并列信息带出去供 UI 提示
  const ties = [] as string[]
  if (sorted[0] && sorted[1] && sorted[0][1] === sorted[1][1]) ties.push(`${sorted[0][0]} = ${sorted[1][0]}`)
  if (sorted[1] && sorted[2] && sorted[1][1] === sorted[2][1] && ties.length === 0) ties.push(`${sorted[1][0]} = ${sorted[2][0]}`)

  const roles = getTopRoles(code)
  const southSchool = getSouthSchoolName(code)
  const careers = isNonSerious ? [] : generateRecommendations(scores)

  // 生成一句总结
  const maxScore = Math.max(...Object.values(scores))
  const peakDims = (Object.entries(scores) as [HollandDimension, number][])
    .filter(([, v]) => v === maxScore)
  const range = maxScore - Math.min(...Object.values(scores))
  const intensity = range >= 20 ? '非常鲜明的' : range >= 12 ? '比较明显的' : '相对均衡的'
  const dimLabels = peakDims.map(([d]) => DIM_NAMES[d]).join('和')
  const summary = isNonSerious
    ? '你似乎对所有题目给出了相同的选择——建议认真重新测评。'
    : `你的兴趣分布是${intensity}「${dimLabels}」型倾向。`

  return {
    code, primary, secondary, tertiary,
    scores, roles,
    southSchool,
    careers,
    summary,
    isNonSerious,
    ties,
  }
}
