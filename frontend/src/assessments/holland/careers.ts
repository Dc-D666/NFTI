// 霍兰德 · 职业推荐引擎（v2 — 余弦相似度加权匹配）
// 每个职业带 6 维需求权重（1-5），匹配算法：cosine_similarity(user_scores, career_weights)

import type { HollandDimension, HollandScores, CareerRecommendation } from '@/types/holland'

// 所有职业统一池（图鉴页亦使用）
export const allCareers: CareerRecommendation[] = [
  // ═══ R 现实型 ═══
  { title: '机械工程师', category:'工程', source:'R',
    weights: { R:5, I:4, C:3, E:2, A:1, S:1 },
    reason:'你喜欢把东西拆开再装回去——机械工程师就是靠这个吃饭的。从设计到装配，每一步都摸得到。' },
  { title: '电气工程师', category:'工程', source:'R',
    weights: { R:5, I:4, C:3, E:2, A:1, S:1 },
    reason:'配电柜里的每根线、每块芯片对你来说不是抽象的——你知道它们怎么配合，也敢上手修。' },
  { title: '建筑设计师', category:'工程', source:'R',
    weights: { R:4, A:4, I:3, C:2, E:2, S:1 },
    reason:'从一张草图到一栋楼——你喜欢让想法变成触手可及的实物，而且每一根钢筋的位置你都在乎。' },
  { title: '外科医生', category:'医疗', source:'R',
    weights: { R:5, I:4, S:3, C:2, E:2, A:1 },
    reason:'动手能力+冷静判断——手术台上每一秒都需要稳、准、快。你不是莽撞，是精准。' },
  { title: '飞行员', category:'工程', source:'R',
    weights: { R:4, I:3, C:3, E:3, S:2, A:1 },
    reason:'操控一台精密机器飞越千里——你的空间感和反应速度在驾驶舱里就是天赋。' },
  { title: '工业设计师', category:'设计', source:'A',
    weights: { R:4, A:5, I:3, C:2, E:2, S:1 },
    reason:'你不只关心东西好不好用，还关心握起来舒不舒服、看起来顺不顺眼。你盯一个水龙头能盯十分钟。' },
  { title: '消防员', category:'公共服务', source:'R',
    weights: { R:5, S:4, E:3, I:2, C:2, A:1 },
    reason:'你需要在几秒内做出生死攸关的判断——别人慌了的时候，你已经行动了。' },

  // ═══ I 研究型 ═══
  { title: '数据科学家', category:'科技', source:'I',
    weights: { I:5, C:3, R:2, E:2, A:2, S:1 },
    reason:'十万行数据在别人眼里是乱码，在你这儿是故事。"为什么这个数字偏高？"这个问题能让你兴奋一整天。' },
  { title: '算法工程师', category:'科技', source:'I',
    weights: { I:5, R:3, C:3, A:2, E:2, S:1 },
    reason:'你喜欢把复杂问题拆成一步步可解的推理——大模型、推荐系统、搜索排序，本质都是"想清楚再写"。' },
  { title: '科研人员', category:'科技', source:'I',
    weights: { I:5, R:3, C:2, A:2, E:1, S:1 },
    reason:'你就是那种为了搞清楚一个问题可以钻进去三年的人。好奇心不是你的爱好，是你的驱动引擎。' },
  { title: '网络安全工程师', category:'科技', source:'I',
    weights: { I:5, R:4, C:3, E:2, A:1, S:1 },
    reason:'你天生喜欢找漏洞——不是钻规则的空子，是找系统的弱点。这种"攻防思维"在安全行业就是核心竞争力。' },
  { title: '医学研究员', category:'医疗', source:'I',
    weights: { I:5, R:3, S:3, C:2, A:1, E:1 },
    reason:'你想搞清楚疾病怎么来的、药怎么起作用的。不是"大概有效"，是"证据确凿"。' },
  { title: '药物研发科学家', category:'医疗', source:'I',
    weights: { I:5, R:3, C:3, A:2, S:2, E:1 },
    reason:'一个新药从分子到上市要十年——你享受把海量数据筛选成一条可验证的假设。' },
  { title: '量化分析师', category:'金融', source:'I',
    weights: { I:5, C:4, E:3, R:2, A:1, S:1 },
    reason:'你喜欢用数学建模金融市场——不是赌博，是找规律。别人靠直觉你靠概率。' },

  // ═══ A 艺术型 ═══
  { title: '插画师', category:'艺术', source:'A',
    weights: { A:5, R:2, I:2, S:1, E:1, C:1 },
    reason:'别人用文字表达，你用线条和色彩。一支笔在手，你能画出别人说不出的东西。' },
  { title: 'UI/UX 设计师', category:'设计', source:'A',
    weights: { A:5, I:4, R:2, C:2, E:2, S:2 },
    reason:'你不只是"画界面"——你在乎用户点哪里最顺手、看完会不会笑。好看只是起点，好体验才是终点。' },
  { title: '影视导演', category:'艺术', source:'A',
    weights: { A:5, E:4, S:3, I:2, R:1, C:1 },
    reason:'你脑子里有画面、有节奏、有情绪——摄像机只是帮你把它们翻译给观众的工具。' },
  { title: '音乐制作人', category:'艺术', source:'A',
    weights: { A:5, I:3, R:2, E:2, C:2, S:1 },
    reason:'你听到一首歌不是听旋律，是听编曲、混音、空间感。你能把一段哼唱变成一首完整的作品。' },
  { title: '新媒体内容创作者', category:'传媒', source:'A',
    weights: { A:5, E:4, S:3, I:2, C:1, R:1 },
    reason:'你拍、你剪、你写、你说——一个人就是一支内容团队。而且你知道什么话题会火。' },
  { title: '广告创意总监', category:'商业', source:'A',
    weights: { A:5, E:5, I:3, S:3, C:2, R:1 },
    reason:'你的超能力是"让人记住"——三秒之内抓住注意力，三十秒之内让人想掏钱。' },
  { title: '建筑外观设计师', category:'设计', source:'A',
    weights: { A:5, R:4, I:3, C:2, E:2, S:1 },
    reason:'你不只想设计能用的空间——你想设计让人站在前面会拍照的空间。' },

  // ═══ S 社会型 ═══
  { title: '中学教师', category:'教育', source:'S',
    weights: { S:5, I:4, A:3, E:2, C:2, R:1 },
    reason:'你帮人讲题不是完成任务——你是真心享受对方恍然大悟那个瞬间。这种人在讲台上几十年都不觉得累。' },
  { title: '心理咨询师', category:'医疗', source:'S',
    weights: { S:5, I:4, A:2, E:1, C:1, R:1 },
    reason:'你对别人的情绪天生敏感——别人嘴上说"没事"，你能听出有事。把这份敏感变成专业的力量。' },
  { title: '护士', category:'医疗', source:'S',
    weights: { S:5, R:4, I:3, C:3, E:2, A:1 },
    reason:'你是病房里能让病人安心的那个人——医学需要技术，但病人更需要温度，而你有。' },
  { title: '社会工作者', category:'公共服务', source:'S',
    weights: { S:5, A:2, I:2, E:2, C:2, R:1 },
    reason:'你没办法看到别人难受而无动于衷——帮人从来不是你的选择，是你的本能反应。' },
  { title: '人力资源主管', category:'商业', source:'S',
    weights: { S:5, E:4, C:3, I:2, A:2, R:1 },
    reason:'你对人的直觉比任何面试题都准——谁适合什么角色，谁和谁能搭班子，你一眼能看出来。' },
  { title: '职业规划师', category:'教育', source:'S',
    weights: { S:5, I:4, A:2, E:2, C:2, R:1 },
    reason:'你喜欢帮人找到方向——不是替人做决定，是让人看清自己。你享受那个"谢谢你我懂了"的瞬间。' },
  { title: '语言治疗师', category:'医疗', source:'S',
    weights: { S:5, I:3, A:3, R:1, C:1, E:1 },
    reason:'你有耐心而且有温度——跟需要额外关注的人打交道，你的细致就是他们的安全感。' },

  // ═══ E 企业型 ═══
  { title: '创业者', category:'商业', source:'E',
    weights: { E:5, I:4, A:3, R:2, S:2, C:1 },
    reason:'你不想等别人给你安排任务——你想自己定义问题，然后带一群人一起去解决它。' },
  { title: '企业管理者', category:'商业', source:'E',
    weights: { E:5, S:4, I:3, C:3, A:2, R:1 },
    reason:'你享受负责一件事从零到一的全过程——定方向、拉团队、盯进度，每个环节都被你带动起来。' },
  { title: '律师', category:'商业', source:'E',
    weights: { E:5, I:5, S:3, C:3, A:2, R:1 },
    reason:'逻辑清晰、表达有力——法庭和谈判桌是你天然的舞台。你不是"会吵架"，你是"能把理说透"。' },
  { title: '投资经理', category:'金融', source:'E',
    weights: { E:5, I:4, C:4, S:2, R:2, A:1 },
    reason:'你擅长在信息不完整时做判断——海量数据进了你的脑子，出来的是一条清晰的决策。' },
  { title: '销售总监', category:'商业', source:'E',
    weights: { E:5, S:4, A:2, I:2, C:2, R:1 },
    reason:'你不是"推销"，你是让人听完觉得"你说得对，我需要这个"。你的说服力是一种天赋。' },
  { title: '项目经理', category:'商业', source:'E',
    weights: { E:5, S:4, C:4, I:3, R:2, A:1 },
    reason:'你能同时盯十几个节点而不乱——你知道谁该干什么、什么时候干完、卡住了怎么推。' },
  { title: '外交官', category:'公共服务', source:'E',
    weights: { E:5, S:5, I:4, A:3, C:2, R:1 },
    reason:'你不是"会说"，你是"能让人想听"——沟通对你来说是天赋，不是技巧。跨文化交流让你兴奋。' },

  // ═══ C 常规型 ═══
  { title: '精算师', category:'金融', source:'C',
    weights: { C:5, I:5, E:3, R:2, A:1, S:1 },
    reason:'你对"概率"有天然的嗅觉——别人看到的是风险，你看到的是可量化的确定性。' },
  { title: '注册会计师', category:'金融', source:'C',
    weights: { C:5, E:3, I:3, R:2, A:1, S:1 },
    reason:'数字和规则是你的舒适区——别人觉得枯燥的报表，在你这儿是清晰的逻辑美。' },
  { title: '审计师', category:'金融', source:'C',
    weights: { C:5, E:3, I:3, R:2, A:1, S:1 },
    reason:'你有耐心逐条核对、不放过任何一个数字偏差——这种"较真"在审计行业不是毛病，是饭碗。' },
  { title: '质量控制工程师', category:'工程', source:'C',
    weights: { C:5, R:4, I:3, E:2, A:1, S:1 },
    reason:'你无法忍受"大概齐"——你负责的质量报告，没有"应该没问题"，只有"检验通过"。' },
  { title: '法务专员', category:'商业', source:'C',
    weights: { C:5, I:4, E:3, A:2, S:2, R:1 },
    reason:'合同里的每一个条款你都会读到第三遍——别人说你"钻牛角尖"，但这就是公司雇你的原因。' },
  { title: '行政主管', category:'商业', source:'C',
    weights: { C:5, E:4, S:3, I:2, A:1, R:1 },
    reason:'流程和制度是你的武器——你把混乱变成秩序，把"差不多"变成"井井有条"。' },
  { title: '图书档案管理员', category:'公共服务', source:'C',
    weights: { C:5, I:3, A:2, S:2, R:1, E:1 },
    reason:'你喜欢把海量信息整理得井井有条——让需要的人能在三分钟内找到想要的东西。' },

  // ═══ 交叉维度职业 ═══
  { title: '机器人工程师', category:'工程', source:'I',
    weights: { I:5, R:5, C:3, E:2, A:2, S:1 },
    reason:'你的脑子在推导公式，你的手在组装零件——机器人行业就需要这种"全栈"的人。' },
  { title: '医疗器械研发工程师', category:'医疗', source:'I',
    weights: { I:5, R:5, C:3, E:2, A:1, S:1 },
    reason:'你既想动手造东西又想知道运作原理——造一台更安全的手术设备，你一个人能干两个团队的活。' },
  { title: '康复治疗师', category:'医疗', source:'S',
    weights: { S:5, R:4, I:3, A:1, E:1, C:1 },
    reason:'你不仅能理解病人的痛苦，还能用手帮他们恢复——共情力 + 动手能力，康复科最需要你。' },
  { title: '体育教练', category:'教育', source:'S',
    weights: { S:5, R:4, E:3, I:2, A:2, C:1 },
    reason:'你自己运动好，还知道怎么让别人运动好——能把动作拆成步骤、把技巧讲清楚。' },
  { title: '精神科医生', category:'医疗', source:'I',
    weights: { I:5, S:5, A:2, E:2, C:1, R:1 },
    reason:'你不只想安慰别人——你还想搞清楚他们为什么痛苦、怎么治疗。心+脑的完美结合。' },
  { title: '美术教师', category:'教育', source:'A',
    weights: { A:5, S:5, I:3, E:2, C:1, R:1 },
    reason:'你喜欢创作，也更喜欢帮别人开启他们的创作——你是那种学生毕业十年后还会提起的老师。' },
  { title: '公益机构负责人', category:'公共服务', source:'S',
    weights: { S:5, E:5, A:3, I:2, C:2, R:1 },
    reason:'你能共情又有执行力——公益行业最缺的不是爱心，是能把事情做成的人。而你刚好都有。' },
  { title: '教务主任', category:'教育', source:'S',
    weights: { S:5, C:5, E:3, I:2, A:2, R:1 },
    reason:'你既能管好一群学生，也能管好一堆表格——教务工作本质上就是高情商的精细化管理。' },
  { title: '产品外观设计师', category:'设计', source:'A',
    weights: { A:5, R:4, I:3, C:2, E:1, S:1 },
    reason:'你不只是"做东西"，你是"做漂亮的东西"。质感、色彩、线条——你摸得到也画得出来。' },
  { title: '工程总监', category:'工程', source:'E',
    weights: { E:5, R:5, I:4, C:3, S:2, A:1 },
    reason:'你懂技术也懂管人——工地上最被尊重的不是只会画图纸的，是会画图还能带着团队干出来的人。' },
  { title: '质量总监', category:'工程', source:'C',
    weights: { C:5, R:4, I:3, E:3, A:1, S:1 },
    reason:'你做的东西不仅好用，而且每一道工序都有据可查——别人说"差不多"的时候你已经有检查报告了。' },
  { title: '科技记者/科普作家', category:'传媒', source:'I',
    weights: { I:5, A:5, S:3, E:2, C:2, R:1 },
    reason:'你能把复杂的东西讲得好看又好懂——把量子物理讲得让初中生都感兴趣，这是你的超能力。' },
  { title: 'CTO / 技术总监', category:'科技', source:'I',
    weights: { I:5, E:5, C:4, R:3, S:2, A:2 },
    reason:'你不仅看得懂技术路线，还能说服团队跟你走——左手写架构右手管团队，科技公司最稀缺的就是这种人。' },
  { title: '生物信息学分析师', category:'医疗', source:'I',
    weights: { I:5, C:4, R:3, A:2, S:1, E:1 },
    reason:'你喜欢用数据破解生命密码——基因测序数据进了你的手，出来就是诊断结论。' },
  { title: '创意总监', category:'商业', source:'A',
    weights: { A:5, E:5, I:3, S:3, C:2, R:1 },
    reason:'你既懂创作又懂怎么卖——单纯会拍片的和单纯会拉投资的，都拼不过你这种人。' },
  { title: '出版社编辑', category:'传媒', source:'A',
    weights: { A:5, C:4, I:3, S:2, E:2, R:1 },
    reason:'你有审美又有执行力——你编的书不仅好看，而且永远准时定稿。在全行业拖稿的环境里你就是瑰宝。' },
  { title: '管理咨询顾问', category:'商业', source:'E',
    weights: { E:5, I:5, S:4, C:4, A:2, R:1 },
    reason:'你既能定战略也能抓执行——CEO最喜欢的人就是"想得到也能做得到"。' },
]

/** 计算余弦相似度 */
function cosineSimilarity(a: number[], b: number[]): number {
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

/** 将 HollandScores 转为有序数组 */
function scoresToArray(s: HollandScores): number[] {
  return [s.R, s.I, s.A, s.S, s.E, s.C]
}

/**
 * 生成职业推荐（v3 混合匹配）
 *
 * 纯余弦相似度在处理「无峰值」用户时失效（所有职业同分）。
 * v3 使用混合算法：70% 余弦（形状匹配）+ 30% 维度打分（强度匹配）。
 *
 * - 余弦部分衡量用户分数模式的「形状」与职业权重模式的相似度
 * - 维度部分用用户在该职业主维度上的绝对得分 / 40 做归一化锚定
 *   确保即使余弦全同（平坦用户），主维度得分仍能区分职业
 */
export function generateRecommendations(scores: HollandScores): CareerRecommendation[] {
  const userVec = scoresToArray(scores)

  const scored = allCareers.map(career => {
    const careerVec = scoresToArray(career.weights)
    const cos = cosineSimilarity(userVec, careerVec)
    // 职业主维度得分归一化（8-40 → 0-1）
    const dimScore = scores[career.source] / 40
    // 混合：70% 模式匹配 + 30% 强度锚定
    const hybrid = cos * 0.7 + dimScore * 0.3
    return { career, similarity: hybrid }
  })

  scored.sort((a, b) => b.similarity - a.similarity)

  return scored.slice(0, 8).map(s => s.career)
}
