import type { PersonalityType } from '@/types'

export interface RelationEntry {
  type: '绝配' | '天敌' | '孽缘' | '专克'
  targetCode: string
  targetName: string
  targetNfti: string
  desc: string
}

// 人格关系图谱数据（与 docs/personality-relationships.md 对应）
export const relationshipMap: Record<string, RelationEntry[]> = {
  // 快速测试 4 种
  OG: [
    { type: '绝配', targetCode: 'RG', targetName: '档案管理员', targetNfti: 'RG', desc: '一个冲在前线，一个守好后方。OG 的执行力需要 RG 的细致来兜底，RG 的沉默需要 OG 的热情来点燃。' },
    { type: '天敌', targetCode: 'RV', targetName: '研究员', targetNfti: 'RV', desc: 'OG 觉得 RV "想太多、动太少"，RV 觉得 OG "吵太多、想太少"。两人同桌一周，RV 会申请换座位。' },
    { type: '孽缘', targetCode: 'OV', targetName: '策划师', targetNfti: 'OV', desc: '同属外放阵营，一个要落地一个要天马行空。合作项目时 OG 会追着 OV 要 deadline，OV 觉得 OG "扼杀创意"。' },
  ],
  OV: [
    { type: '绝配', targetCode: 'RV', targetName: '研究员', targetNfti: 'RV', desc: 'OV 负责点火，RV 负责添柴。一个出点子一个做深度分析，凌晨三点的脑暴会话匣子永远关不上。' },
    { type: '天敌', targetCode: 'RG', targetName: '档案管理员', targetNfti: 'RG', desc: 'RG 的"按规矩来"是 OV 的紧箍咒，OV 的"突发奇想"是 RG 的噩梦。RG 的笔记被 OV 借走永远还不回来。' },
    { type: '孽缘', targetCode: 'OG', targetName: '运营主管', targetNfti: 'OG', desc: '两人合作办活动：OV 策划了 18 个方案，OG 只关心"预算多少、几点开始、谁搬桌子"。' },
  ],
  RG: [
    { type: '绝配', targetCode: 'OG', targetName: '运营主管', targetNfti: 'OG', desc: 'RG 是 OG 最靠谱的副手，OG 是 RG 唯一愿意跟着"疯"一次的人。' },
    { type: '天敌', targetCode: 'OV', targetName: '策划师', targetNfti: 'OV', desc: 'RG 的座右铭是"稳定压倒一切"，OV 的座右铭是"不变就是等死"。' },
    { type: '孽缘', targetCode: 'RV', targetName: '研究员', targetNfti: 'RV', desc: '同属内敛阵营，一个务实一个务虚。RG 觉得 RV "不接地气"，RV 觉得 RG "只会抄笔记"。但期末复习时两人会默契地占据图书馆对角线。' },
  ],
  RV: [
    { type: '绝配', targetCode: 'OV', targetName: '策划师', targetNfti: 'OV', desc: 'RV 是 OV 唯一能听懂"如果食堂排队服从泊松分布"这个梗的人。' },
    { type: '天敌', targetCode: 'OG', targetName: '运营主管', targetNfti: 'OG', desc: 'OG 在 RV 耳边说十句话，RV 只回一个"嗯"，OG 以为 RV 同意了，其实 RV 根本没在听。' },
    { type: '孽缘', targetCode: 'RG', targetName: '档案管理员', targetNfti: 'RG', desc: '两人表面上互相嫌弃，但考试前 RG 的笔记和 RV 的押题卷会在黑市上被同时抢购。' },
  ],

  // 完整测试 16 种标准人格
  HEAD: [
    { type: '绝配', targetCode: 'DORM', targetName: '宿舍长', targetNfti: 'RGES', desc: '一个管全班，一个管寝室。HEAD 在前台发号施令，DORM 在后台把每个人的情绪安抚好。没有 DORM 的 HEAD 是光杆司令。' },
    { type: '天敌', targetCode: 'BANDIT', targetName: '土匪头子', targetNfti: 'OVLF', desc: 'HEAD 刚说完"安静"，BANDIT 就接一句"老师他说得对"。HEAD 的权威在 BANDIT 眼里就是用来挑战的。' },
    { type: '专克', targetCode: 'PUPPY', targetName: '快乐小狗', targetNfti: 'OVES', desc: 'PUPPY 一笑，HEAD 的严肃面具就裂了。HEAD 想骂 PUPPY，PUPPY 一撒娇，HEAD 只能叹口气说"下不为例"。' },
  ],
  MILKTEA: [
    { type: '绝配', targetCode: 'GENIUS', targetName: '985er', targetNfti: 'RGLS', desc: 'MILKTEA 给 GENIUS 带奶茶，GENIUS 给 MILKTEA 讲题。一个提供情绪价值，一个提供绩点价值，互惠互利，天长地久。' },
    { type: '天敌', targetCode: 'MONITOR', targetName: '监控', targetNfti: 'RVLF', desc: 'MILKTEA 在走廊里刚想大声喊人，MONITOR 从拐角飘出来"你刚才分贝超标了"。MILKTEA 的热情被 MONITOR 精准冻结。' },
    { type: '专克', targetCode: 'LEADER', targetName: '南方领导', targetNfti: 'OVLS', desc: 'LEADER 想指挥 MILKTEA，MILKTEA 眨眨眼说"可是我请大家喝奶茶了耶"，LEADER 的 KPI 瞬间崩塌。' },
  ],
  JIAHAO: [
    // DASI 为隐藏款（解锁条件高S+高J），无固定 fourLetter；RG?? 表示 S+J 已知、其余维度未知
    { type: '绝配', targetCode: 'DASI', targetName: '再串打死', targetNfti: 'RG??', desc: '天生一对。JIAHAO 在前面搞事，DASI 在后面兜底。一个负责出风头，一个负责写检讨。' },
    { type: '天敌', targetCode: 'SCHEMER', targetName: '南中战略家', targetNfti: 'RVLS', desc: 'SCHEMER 每一步都算好了，JIAHAO 每一步都踩在 SCHEMER 算好的外面。SCHEMER 的 Excel 里永远没有 JIAHAO 这个变量。' },
    { type: '专克', targetCode: 'HEAD', targetName: '班主任', targetNfti: 'OGLS', desc: 'HEAD 想管 JIAHAO，JIAHAO 一句"老师我这是为了班级荣誉"让 HEAD 当场语塞。' },
  ],
  BANDIT: [
    { type: '绝配', targetCode: 'SPOILER', targetName: '厕所大门破坏者', targetNfti: 'OGLF', desc: '一个出主意，一个出体力。BANDIT 说"我们把黑板报改成互动装置吧"，SPOILER 已经把墙拆了。' },
    { type: '天敌', targetCode: 'HEAD', targetName: '班主任', targetNfti: 'OGLS', desc: 'BANDIT 的检讨书比作文还长，HEAD 的血压比月考分数线还高。' },
    { type: '专克', targetCode: 'ZXF', targetName: '张雪峰', targetNfti: 'OVES', desc: 'BANDIT 想搞事，ZXF 一句"你这样做对高考有帮助吗"让 BANDIT 当场冷静。' },
  ],
  SPOILER: [
    { type: '绝配', targetCode: 'BANDIT', targetName: '土匪头子', targetNfti: 'OVLF', desc: '两人 together 是南方中学的"自然灾害预警"。' },
    { type: '天敌', targetCode: 'GENIUS', targetName: '985er', targetNfti: 'RGLS', desc: 'GENIUS 在算这道题有几种解法，SPOILER 已经把草稿纸撕了折纸飞机。GENIUS 的眼镜片在颤抖。' },
    { type: '专克', targetCode: 'TOOLBOX', targetName: '人形工具箱', targetNfti: 'RGLF', desc: 'SPOILER 弄坏的东西，TOOLBOX 默默修好。SPOILER 永远不知道是谁修的，但东西永远能用。' },
  ],
  PUPPY: [
    { type: '绝配', targetCode: 'DREAMER', targetName: '南中梦想家', targetNfti: 'RVEF', desc: 'PUPPY 把 DREAMER 从玉兰花窗台前拉出来晒太阳，DREAMER 给 PUPPY 的诗配上插画。一个负责发光，一个负责做梦。' },
    { type: '天敌', targetCode: 'MONITOR', targetName: '监控', targetNfti: 'RVLF', desc: 'PUPPY 的笑声是 MONITOR 的声波攻击。' },
    { type: '专克', targetCode: 'HEAD', targetName: '班主任', targetNfti: 'OGLS', desc: 'PUPPY 是 HEAD 唯一舍不得记过的人。' },
  ],
  LEADER: [
    { type: '绝配', targetCode: 'SCHEMER', targetName: '南中战略家', targetNfti: 'RVLS', desc: 'LEADER 负责喊"冲"，SCHEMER 负责画路线图。一个台前一个幕后，南方中学的双核处理器。' },
    { type: '天敌', targetCode: 'JIAHAO', targetName: '南方嘉豪', targetNfti: 'OVEF', desc: 'LEADER 的甘特图上永远有一块写着"JIAHAO 不可控"。' },
    { type: '专克', targetCode: 'MILKTEA', targetName: '奶茶团宠', targetNfti: 'OGES', desc: 'MILKTEA 的人缘让 LEADER 的权威显得苍白。' },
  ],
  ZXF: [
    { type: '绝配', targetCode: 'SCHEMER', targetName: '南中战略家', targetNfti: 'RVLS', desc: 'ZXF 说"这个专业不行"，SCHEMER 说"我已经算过就业率了"。两人在选科问题上能聊三天三夜。' },
    { type: '天敌', targetCode: 'DREAMER', targetName: '南中梦想家', targetNfti: 'RVEF', desc: 'ZXF 问 DREAMER"你将来想做什么"，DREAMER 说"我想去一个很远的地方"，ZXF 当场打开 Excel 开始算高铁票价。' },
    { type: '专克', targetCode: 'BANDIT', targetName: '土匪头子', targetNfti: 'OVLF', desc: 'ZXF 的"实用主义"是 BANDIT 的终极刹车片。' },
  ],
  GENIUS: [
    { type: '绝配', targetCode: 'MILKTEA', targetName: '奶茶团宠', targetNfti: 'OGES', desc: 'GENIUS 的笔记和 MILKTEA 的奶茶是南方中学硬通货市场的双巨头。' },
    { type: '天敌', targetCode: 'SPOILER', targetName: '厕所大门破坏者', targetNfti: 'OGLF', desc: 'SPOILER 是 GENIUS 学习计划中的唯一不可控变量。' },
    { type: '专克', targetCode: 'WEEKLY', targetName: '新闻周刊', targetNfti: 'RVES', desc: 'WEEKLY 一篇文章让 GENIUS 从"内卷标兵"变成"被同情的对象"，GENIUS 第一次意识到原来有人在乎"为什么卷"而不是"卷了多少"。' },
  ],
  DORM: [
    { type: '绝配', targetCode: 'HEAD', targetName: '班主任', targetNfti: 'OGLS', desc: 'DORM 是 HEAD 最信任的"民间情报员"，知道每个寝室的实时动态。' },
    { type: '天敌', targetCode: 'JIAHAO', targetName: '南方嘉豪', targetNfti: 'OVEF', desc: 'JIAHAO 半夜翻墙出去，DORM 在门卫室帮他圆谎。DORM 不是不想管，是管了也没用。' },
    { type: '专克', targetCode: 'SEWOO', targetName: '希沃大师', targetNfti: 'RGEF', desc: 'SEWOO 修好了全班的希沃，DORM 给 SEWOO 带了三天早餐。DORM 的温柔让 SEWOO 从"技术宅"变成了"有人关心的技术宅"。' },
  ],
  DREAMER: [
    { type: '绝配', targetCode: 'PUPPY', targetName: '快乐小狗', targetNfti: 'OVES', desc: 'DREAMER 写诗，PUPPY 朗诵；DREAMER 画画，PUPPY 裱框。' },
    { type: '天敌', targetCode: 'ZXF', targetName: '张雪峰', targetNfti: 'OVES', desc: 'ZXF 的每一句话都在把 DREAMER 从云端拽回地面。' },
    { type: '专克', targetCode: 'MONITOR', targetName: '监控', targetNfti: 'RVLF', desc: 'MONITOR 知道 DREAMER 所有的小秘密，但从不揭穿。DREAMER 在 MONITOR 面前可以彻底放松——因为反正都被看穿了。' },
  ],
  MONITOR: [
    { type: '绝配', targetCode: 'TOOLBOX', targetName: '人形工具箱', targetNfti: 'RGLF', desc: '一个观察，一个行动。MONITOR 发现柜子门坏了，TOOLBOX 已经修好了。两人从未正式交流过，但默契度 100%。' },
    { type: '天敌', targetCode: 'PUPPY', targetName: '快乐小狗', targetNfti: 'OVES', desc: 'PUPPY 的存在本身就是对 MONITOR 观察系统的 DDoS 攻击。' },
    { type: '专克', targetCode: 'DREAMER', targetName: '南中梦想家', targetNfti: 'RVEF', desc: 'MONITOR 是 DREAMER 唯一不需要伪装的人。' },
  ],
  TOOLBOX: [
    { type: '绝配', targetCode: 'MONITOR', targetName: '监控', targetNfti: 'RVLF', desc: '两人是南方中学最神秘的"幽灵搭档"。' },
    { type: '天敌', targetCode: 'SPOILER', targetName: '厕所大门破坏者', targetNfti: 'OGLF', desc: 'SPOILER 的破坏速度超过了 TOOLBOX 的修复速度，这是 TOOLBOX 职业生涯中唯一的挫败。' },
    { type: '专克', targetCode: 'SEWOO', targetName: '希沃大师', targetNfti: 'RGEF', desc: 'TOOLBOX 修硬件，SEWOO 修软件。两人合作能修好学校里一切带电的东西——除了食堂的刷卡机。' },
  ],
  SEWOO: [
    { type: '绝配', targetCode: 'TOOLBOX', targetName: '人形工具箱', targetNfti: 'RGLF', desc: '两人是南方中学 IT 界的"双子星"。' },
    { type: '天敌', targetCode: 'LEADER', targetName: '南方领导', targetNfti: 'OVLS', desc: 'LEADER 让 SEWOO "五分钟内修好投影"，SEWOO 说"问题不在投影在路由器"，LEADER 说"我不管反正五分钟后要用"。' },
    { type: '专克', targetCode: 'DORM', targetName: '宿舍长', targetNfti: 'RGES', desc: 'DORM 的关心让 SEWOO 第一次觉得"被需要"和"被使用"是不一样的。' },
  ],
  SCHEMER: [
    { type: '绝配', targetCode: 'LEADER', targetName: '南方领导', targetNfti: 'OVLS', desc: '两人的组合叫"南方双煞"，一个负责想一个负责做。' },
    { type: '天敌', targetCode: 'JIAHAO', targetName: '南方嘉豪', targetNfti: 'OVEF', desc: 'SCHEMER 的模型里永远缺少"JIAHAO 因子"。' },
    { type: '专克', targetCode: 'WEEKLY', targetName: '新闻周刊', targetNfti: 'RVES', desc: 'WEEKLY 一篇深度报道让 SCHEMER 从"冷血 strategist"变成了"有温度的学长"，SCHEMER 的复盘文档里第一次出现了"情感成本"这一栏。' },
  ],
  WEEKLY: [
    { type: '绝配', targetCode: 'DREAMER', targetName: '南中梦想家', targetNfti: 'RVEF', desc: 'WEEKLY 写故事，DREAMER 提供素材。DREAMER 的每一个"无关紧要"的细节，在 WEEKLY 笔下都成了动人的篇章。' },
    { type: '天敌', targetCode: 'LEADER', targetName: '南方领导', targetNfti: 'OVLS', desc: 'LEADER 说"数据说话"，WEEKLY 说"人说话"。LEADER 的 PPT 和 WEEKLY 的散文在班会上正面交锋。' },
    { type: '专克', targetCode: 'GENIUS', targetName: '985er', targetNfti: 'RGLS', desc: 'WEEKLY 让 GENIUS 第一次被"看见"而不是被"测量"。' },
  ],

  // 隐藏款
  MEOW: [
    { type: '绝配', targetCode: 'DREAMER', targetName: '南中梦想家', targetNfti: 'RVEF', desc: '两个"不想被理解只想被陪伴"的灵魂。MEOW 在窗台晒太阳，DREAMER 在隔壁画画，两人一整天不说话，但都知道对方在。' },
    { type: '天敌', targetCode: 'OG', targetName: '运营主管', targetNfti: 'OG', desc: 'OG 的热情对 MEOW 来说是社交过载。OG 说"我们一起吃个饭吧"，MEOW 已经消失了。' },
    { type: '专克', targetCode: 'PUPPY', targetName: '快乐小狗', targetNfti: 'OVES', desc: 'PUPPY 是唯一能让 MEOW 主动蹭过去的人。不是 PUPPY 特别，是 PUPPY 的"不期待回应"让 MEOW 感到安全。' },
  ],
  DASI: [
    { type: '绝配', targetCode: 'JIAHAO', targetName: '南方嘉豪', targetNfti: 'OVEF', desc: '天生一对。DASI 的稳重是 JIAHAO 的锚，JIAHAO 的跳脱是 DASI 的风。' },
    { type: '天敌', targetCode: 'BANDIT', targetName: '土匪头子', targetNfti: 'OVLF', desc: 'BANDIT 的"搞事情"和 DASI 的"再串打死"是两种截然不同的 chaos。BANDIT 是主动的乱，DASI 是被动的崩。' },
    { type: '专克', targetCode: 'HEAD', targetName: '班主任', targetNfti: 'OGLS', desc: 'HEAD 想管 DASI，DASI 一句"欢迎报考株洲市南方中学"让 HEAD 当场愣住——这人是认真的还是在阴阳？' },
  ],
  '####': [
    { type: '绝配', targetCode: '####', targetName: '南方乱码', targetNfti: '———', desc: '只有另一个 GLITCH 能理解 GLITCH。两个系统错误相遇，反而组成了一个新的、稳定的乱码系统。' },
    { type: '天敌', targetCode: 'SCHEMER', targetName: '南中战略家', targetNfti: 'RVLS', desc: 'SCHEMER 试图用模型解释 GLITCH，GLITCH 在 SCHEMER 的 Excel 里插入了随机数。SCHEMER 的电脑死机了。' },
    { type: '专克', targetCode: '所有人', targetName: '所有人', targetNfti: 'ALL', desc: 'GLITCH 没有专克谁，因为 GLITCH 不可预测。今天专克 HEAD，明天专克 MEOW，后天可能和 SPOILER 一起拆了食堂。这就是 GLITCH 的魅力。' },
  ],
}

export function getRelations(code: string): RelationEntry[] {
  return relationshipMap[code] || []
}
