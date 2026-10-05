// 霍兰德六种维度定义（使用标准维度名，不使用校园花名）
import type { HollandDimension, HollandRole } from '@/types/holland'

export const hollandRoles: Record<HollandDimension, HollandRole> = {
  R: {
    dimension: 'R',
    name: '现实型',
    emoji: '🔧',
    description: '投影仪坏了你第一个上，研学器材你负责搬。比起发朋友圈你更愿意修好一台相机——也不是不发，是忘了。',
    suitableClubs: ['湘BA🏀', '生物社实验组', '摄影社器材组'],
    suitableDirections: ['工程技术', '计算机科学', '建筑学', '机械工程'],
  },
  I: {
    dimension: 'I',
    name: '研究型',
    emoji: '🔬',
    description: '月考后先翻错题本的不是在看排名，是在想「这道题到底为什么错了」。你的笔记是班级硬通货——毕业前至少五个人借过。食堂排队你都在心里推算哪个窗口最快，还真猜对了。',
    suitableClubs: ['生物社竞赛组', '各学科竞赛组', '答疑学长团'],
    suitableDirections: ['数学 / 物理', '生物 / 化学', '计算机科学', '医学'],
  },
  A: {
    dimension: 'A',
    name: '艺术型',
    emoji: '🎨',
    description: '课本空白处画涂鸦，晚霞配一句文案发频道。走廊黑板报换届你在旁边站了十分钟——不是在看，是在想「如果是我就这样画」。',
    suitableClubs: ['文学社', '摄影社', '动漫社', '街舞社', '话剧社'],
    suitableDirections: ['文学 / 新闻', '艺术设计', '音乐 / 表演', '广告 / 传媒'],
  },
  S: {
    dimension: 'S',
    name: '社会型',
    emoji: '🤝',
    description: '频道求助版块常驻——知道就回，不知道就帮 @ 对的人。分班后最先认识全班。被评价「跟你待五分钟，心情就好了」。',
    suitableClubs: ['答疑学长团', '校学生科志愿者', '班级联络员'],
    suitableDirections: ['教育学', '心理学', '社会工作', '人力资源'],
  },
  E: {
    dimension: 'E',
    name: '企业型',
    emoji: '💼',
    description: '商帮摆摊你负责叫卖，运动会你负责指挥。全班最轻松的是跟你同组的人——因为活都被你分好了。',
    suitableClubs: ['商帮', '校拟大赛策划组', '活动策划'],
    suitableDirections: ['工商管理', '市场营销', '法学', '公共关系'],
  },
  C: {
    dimension: 'C',
    name: '常规型',
    emoji: '📋',
    description: '班费流水你记的，复习计划你排的。期中考精确到每小时——而且真的一条条打勾了。同学的评价：「交给你不用问第二遍。」',
    suitableClubs: ['社团财务', '宿舍记分员', '班级档案管理'],
    suitableDirections: ['会计 / 审计', '行政管理', '图书馆学', '数据分析'],
  },
}

// 根据霍兰德代码获取前三位角色
// 防御：code 可能来自 DB 历史/导入数据，不足 3 位或含非法维度时补全为合法值，
// 避免渲染时访问 undefined（如 ProfilePage 从 type_code 直接构造 roles）
const FALLBACK_DIMS: HollandDimension[] = ['R', 'I', 'A']
export function getTopRoles(code: string): [HollandRole, HollandRole, HollandRole] {
  const dims = (code || '').split('') as HollandDimension[]
  const safeDims = ([dims[0], dims[1], dims[2]] as (HollandDimension | undefined)[])
    .map((d, i) => (d && hollandRoles[d] ? d : FALLBACK_DIMS[i] ?? 'R'))
  return [
    hollandRoles[safeDims[0]!],
    hollandRoles[safeDims[1]!],
    hollandRoles[safeDims[2]!],
  ]
}

// ─── 南方中学 · 霍兰德人格图鉴（22 种特色人设）───
// 【已废弃】前端不再展示花名标签，相关代码已注释。
// 如需恢复，见 git history 中 roles.ts 的完整 personaTable 定义。
//
// interface Persona {
//   label: string
//   emoji: string
//   story: string
//   prefix: [string, string]
// }
//
// const personaTable: Persona[] = [
//   { label: '万能胶',       emoji: '🫂', prefix: ['S','A'], story: '...' },
//   { label: '人间充电宝',   emoji: '🔋', prefix: ['S','E'], story: '...' },
//   // ...（22 种人设完整定义见 git history）
// ]

// 根据前两位代码查找人设（已废弃，始终返回 null）
export function getPersona(_code: string): null {
  return null
}

export const getSouthSchoolName = getPersona
