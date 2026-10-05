// 图鉴收集系统：从用户测试记录推导已收集的人格 / 职业
import { fullTypes } from '@/data/personalities'
import { generateRecommendations, allCareers } from '@/assessments/holland/careers'
import type { HollandDimension, HollandScores } from '@/types/holland'

/** 测试记录条目（与 dbGetResults 返回结构对应） */
export interface GalleryTestRecord {
  assessment_type?: string
  type_code: string
  type_name?: string
  scores?: Record<string, number>
  mode?: string
}

/** 从 NFTI 测试记录收集人格 code（仅完整测试，快速人格不计入图鉴） */
export function collectNfti(records: GalleryTestRecord[]): Set<string> {
  const set = new Set<string>()
  for (const r of records) {
    if (r.assessment_type && r.assessment_type !== 'nfti') continue
    // 快速测试（mode='quick'）的人格不进图鉴
    if (r.mode === 'quick') continue
    if (r.type_code) set.add(r.type_code)
  }
  return set
}

/** 从霍兰德测试记录收集职业 title（用已存 scores 重算推荐，前 8 个计入） */
export function collectCareers(records: GalleryTestRecord[]): Set<string> {
  const set = new Set<string>()
  for (const r of records) {
    if (r.assessment_type !== 'holland') continue
    if (!r.scores) continue
    // 防御：scores 六维缺失会导致 cosine 计算 NaN，跳过异常记录
    const dims: HollandDimension[] = ['R', 'I', 'A', 'S', 'E', 'C']
    if (!dims.every(d => typeof r.scores![d] === 'number')) continue
    const scores = r.scores as HollandScores
    const recs = generateRecommendations(scores)
    for (const c of recs) set.add(c.title)
  }
  return set
}

/** 图鉴收集进度 */
export interface GalleryProgress {
  collectedNfti: number
  totalNfti: number
  collectedCareers: number
  totalCareers: number
}

export function galleryProgress(nftiSet: Set<string>, careerSet: Set<string>): GalleryProgress {
  const allNfti = fullTypes
  const totalCareers = allCareers.length
  let collectedNfti = 0
  for (const t of allNfti) if (nftiSet.has(t.code)) collectedNfti++
  return {
    collectedNfti,
    totalNfti: allNfti.length,
    collectedCareers: careerSet.size,
    totalCareers,
  }
}

/** 计算「我的收集数」在全站用户收集数中的百分位（超过 xx% 的用户）
 *  分母 = 全站人数（含自己）；分子 = 严格少于我的收集数的人数。
 *  同收集数者不算「被超过」，避免剔除后虚高。
 */
export function collectionPercentile(myCount: number, allCounts: number[]): number {
  const total = allCounts.length
  if (!total) return 0
  let less = 0
  for (const c of allCounts) if (c < myCount) less++
  return Math.round((less / total) * 100)
}
