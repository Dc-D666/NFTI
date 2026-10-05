// 霍兰德 × NFTI 交叉分析映射
// 两者是互补关系：NFTI 描述「你是谁」，霍兰德描述「你想做什么」
// 映射为常见组合参考，非强关联

export interface CrossAnalysis {
  nftiCode: string
  nftiName: string
  commonHolland: string[]
  insight: string
  suitableRoles: string[]
}

export const crossMap: CrossAnalysis[] = [
  {
    nftiCode: 'OVES',
    nftiName: '南方氛围组',
    commonHolland: ['SEA', 'ESA', 'SAE'],
    insight: '你的社交天赋和氛围感，加上社会型和企业的执行力——你是社团招新时的「门面担当」，也是活动策划的核心人物。',
    suitableRoles: ['社团外联', '活动策划', '招新宣传'],
  },
  {
    nftiCode: 'OGES',
    nftiName: '奶茶团宠',
    commonHolland: ['SAE', 'ASE', 'SEA'],
    insight: '你天生照顾别人的感受，又有艺术细胞的加持——文学社的编辑、答疑团的暖心学长/学姐，都很适合你。',
    suitableRoles: ['文学社编辑', '答疑学长团', '班级心理委员'],
  },
  {
    nftiCode: 'RVLS',
    nftiName: '南中战略家',
    commonHolland: ['ICR', 'IRC', 'CIR'],
    insight: '你的战略思维加上研究型和事务型的倾向——你是竞赛队里的军师，也是数据分析的好手。',
    suitableRoles: ['竞赛组核心', '数据分析', '策略规划'],
  },
  {
    nftiCode: 'OGLS',
    nftiName: '班主任',
    commonHolland: ['CER', 'CRE', 'ECR'],
    insight: '你的规则意识和组织能力，配上事务型和企业的执行力——不做班长都可惜了。',
    suitableRoles: ['班长', '社团社长', '活动总控'],
  },
  {
    nftiCode: 'RVEF',
    nftiName: '南中梦想家',
    commonHolland: ['AIS', 'IAS', 'AIRS', 'SAI'],
    insight: '你的内心世界像一座丰富的矿藏，艺术型和研究的结合让你既有创造力又有深度——文学社、摄影社都是你的主场。',
    suitableRoles: ['文学创作', '摄影', '内容运营', '音乐'],
  },
  {
    nftiCode: 'JIAHAO',
    nftiName: '南方嘉豪',
    commonHolland: ['EAS', 'ESA', 'AES'],
    insight: '你的创意和行动力是绝配——商帮的爆款策划、社团的创新活动，都需要你这种敢想敢干的人。',
    suitableRoles: ['活动策划', '商帮运营', '创意总监'],
  },
  {
    nftiCode: 'GENIUS',
    nftiName: '985er',
    commonHolland: ['ICR', 'IRC', 'CIR'],
    insight: '你的专注力和条理性是顶尖的——研究型和事务型的组合让你在学业和竞赛中无往不利。',
    suitableRoles: ['竞赛选手', '学习委员', '笔记整理'],
  },
  {
    nftiCode: 'DORM',
    nftiName: '宿舍长',
    commonHolland: ['SCA', 'SAC', 'CSA'],
    insight: '你的温柔和条理是社会型和事务型的完美体现——班级的后勤保障、社团的温暖担当，非你莫属。',
    suitableRoles: ['生活委员', '社团后勤', '班级联络员'],
  },
  {
    nftiCode: 'BANDIT',
    nftiName: '土匪头子',
    commonHolland: ['ERI', 'EIR', 'REI'],
    insight: '你的不羁之下藏着实干和研究的基因——别人觉得你在搞事情，其实你在用自己的方式解决问题。适合创新和突破常规的领域。',
    suitableRoles: ['创新项目', '辩论队', '策略游戏'],
  },
  {
    nftiCode: 'WEEKLY',
    nftiName: '新闻周刊',
    commonHolland: ['AIS', 'IAS', 'SAI'],
    insight: '你敏锐的观察力加上艺术型和社会的倾向——频道的内容创作者、学校的校刊编辑，都是你的好归宿。',
    suitableRoles: ['频道运营', '校刊编辑', '内容创作'],
  },
  {
    nftiCode: 'LEADER',
    nftiName: '南方领导',
    commonHolland: ['ECR', 'ERC', 'CER'],
    insight: '你的执行力和远见卓识配上企业型和事务型——你是天生的管理者，社团会长、学生会主席都不在话下。',
    suitableRoles: ['学生会', '社团联合会', '项目负责人'],
  },
  {
    nftiCode: 'ZXF',
    nftiName: '张雪峰',
    commonHolland: ['SER', 'ESR', 'ERS'],
    insight: '你的热心和逻辑能力是社会型的核心——答疑学长团、选科指导、学习分享，你能帮到很多人。',
    suitableRoles: ['答疑学长团', '选科指导', '学习分享'],
  },
  {
    nftiCode: 'MONITOR',
    nftiName: '监控',
    commonHolland: ['IRC', 'RIC', 'CIR'],
    insight: '你的观察力和逻辑分析能力是研究型的极致——竞赛、编程、数据分析，需要深度思考的领域都适合你。',
    suitableRoles: ['编程竞赛', '数据分析', '策略分析'],
  },
  {
    nftiCode: 'PUPPY',
    nftiName: '快乐小狗',
    commonHolland: ['SEA', 'ESA', 'AES'],
    insight: '你的感染力和表现欲是社会型和艺术的结合——舞台是你的主场，社团招新的王牌非你莫属。',
    suitableRoles: ['活动主持', '社团招新', '文艺汇演'],
  },

  {
    nftiCode: 'TOOLBOX',
    nftiName: '人形工具箱',
    commonHolland: ['RCI', 'RIC', 'CRI'],
    insight: '你的动手能力和冷静分析是实干派和研究型的结合——技术维修、实验操作、手工制作，凡是要动手的事都难不倒你。',
    suitableRoles: ['技术维修', '实验助手', '手工制作'],
  },
  {
    nftiCode: 'SEWOO',
    nftiName: '希沃大师',
    commonHolland: ['AER', 'ARE', 'EAR'],
    insight: '你的审美和动手能力是艺术和实干的结合——黑板报设计、舞台布景、活动视觉，你做的东西永远好看又实用。',
    suitableRoles: ['视觉设计', '舞台美术', '活动布置'],
  },
  {
    nftiCode: 'SPOILER',
    nftiName: '厕所大门破坏者',
    commonHolland: ['ERI', 'REI', 'EAR'],
    insight: '你的行动力和决断力是企业型的核心——体育赛事组织、户外活动策划、应急处理，你就是那个冲在最前面的人。',
    suitableRoles: ['体育委员', '户外活动', '应急协调'],
  },
  {
    nftiCode: 'SCHEMER',
    nftiName: '南中战略家',
    commonHolland: ['ICR', 'IRC', 'ECR'],
    insight: '你的长远眼光和逻辑分析是研究型和企业型的结合——你不在意外界的喧嚣，只管走自己规划好的路。',
    suitableRoles: ['长期规划', '竞赛策略', '项目管理'],
  },
]

// 根据霍兰德代码推荐 NFTI 人格
export function recommendNftiByHolland(hollandCode: string): CrossAnalysis[] {
  const matches = crossMap.filter(c => c.commonHolland.includes(hollandCode))
  // 如果没有精确匹配，找至少共享首位代码的
  if (matches.length === 0) {
    const firstLetter = hollandCode[0]
    return crossMap.filter(c => c.commonHolland.some(h => h[0] === firstLetter)).slice(0, 3)
  }
  return matches.slice(0, 3)
}

// 根据 NFTI 代码获取交叉分析
export function getCrossByNfti(nftiCode: string): CrossAnalysis | undefined {
  return crossMap.find(c => c.nftiCode === nftiCode)
}
