// 默契度规则数据（matchRules.ts）
// 称号表来源：docs/match-titles-draft.md（2026-08 定稿，193 条手写 + 镜像 + 双向特例）
// 查询规则：双向特例优先 → 手写表双向查找 → 兜底命名

export interface MatchTitleResult {
  title: string
  /** 是否使用了反向视角称号（仅双向特例命中时） */
  reversed?: boolean
}

// ─── 手写称号表（方向无关，查询时双向尝试）───
const MATCH_TITLES: Record<string, Record<string, string>> = {
  "MEOW": { "MEOW": "双猫对峙", "HEAD": "班主任 × 校长（猫）", "MILKTEA": "高冷猫 × 自动喂食器", "JIAHAO": "猫 × 逗猫棒", "BANDIT": "一个拆家，一个看戏", "SPOILER": "猫 × 疯狗", "PUPPY": "高冷猫 × 他的饲养员", "LEADER": "计划通 × 猫不理", "ZXF": "\"你将来打算做什么\" × \"喵\"", "GENIUS": "双沉默·猫版", "DORM": "唯一敢摸猫学长的人", "DREAMER": "窗台双猫", "MONITOR": "一只晒太阳，一只敲代码", "TOOLBOX": "隐形人 × 隐形猫", "SEWOO": "模特 × 画师（模特跑了）", "SCHEMER": "算到了，但猫不在乎", "WEEKLY": "互相偷看一学期", "DASI": "高冷不超过三秒", "####": "两只无法解析的存在" },
  "DASI": { "DASI": "食堂双王", "HEAD": "\"全班安静\" × \"我吃完了\"", "MILKTEA": "首席品鉴师 × 首席投喂官", "JIAHAO": "天生一对 ⭐官方钦定", "BANDIT": "一个研究规则，一个研究菜单", "SPOILER": "打饭攻略组", "PUPPY": "点菜 × 点评", "LEADER": "SWOT 干饭 × 纯干饭", "ZXF": "职业规划 × 职业规划（食堂版）", "GENIUS": "两个精确到分钟的人", "DORM": "\"多吃点\" × \"好嘞\"", "DREAMER": "他写诗，他干饭", "MONITOR": "算法工程师 × 首席测试员", "TOOLBOX": "后勤部长 × 饭卡持有者", "SEWOO": "攻略 × 插画", "SCHEMER": "博弈论干饭 × 实证干饭", "WEEKLY": "情报局双处长", "MEOW": "高冷不超过三秒", "####": "系统无法解析的干饭人" },
  "####": { "####": "系统死机现场", "HEAD": "唯一让班主任放弃治疗的人", "MILKTEA": "唯一能温暖乱码的人", "JIAHAO": "拒绝被定义 × 无法被定义", "BANDIT": "教导主任的噩梦组合", "SPOILER": "规则外的 × 物理破坏的", "PUPPY": "快乐不分类", "LEADER": "唯一让项目经理没辙的人", "ZXF": "张雪峰职业生涯最大挑战", "GENIUS": "985 都解不出来的题", "DORM": "照顾乱码的人", "DREAMER": "两个在规则外的人", "MONITOR": "返回值：null", "TOOLBOX": "被忽略 × 被忽略", "SEWOO": "色卡上找不到的颜色", "SCHEMER": "战略家唯一算不准的人", "WEEKLY": "新闻周刊的头版之谜", "MEOW": "两只无法解析的存在", "DASI": "系统无法解析的干饭人" },
  "HEAD": { "HEAD": "双主任办公会", "MILKTEA": "铁面主任 × 零食部长", "JIAHAO": "纪律委员 × 气氛组", "BANDIT": "教导主任 × 黑名单常客", "SPOILER": "\"走廊里不许跑\" × 第七次", "PUPPY": "\"全班安静\" × \"哈哈哈哈\"", "LEADER": "会议室双雄", "ZXF": "政教处 × 就业办", "GENIUS": "纪律委员 × 卷王", "DORM": "\"全班安静\" × \"小声点，他睡了\"", "DREAMER": "罚站搭子", "MONITOR": "\"别看电脑了\" × \"代码没跑完\"", "TOOLBOX": "点名 × 隐形人", "SEWOO": "\"别画了\" × \"马上就好\"", "SCHEMER": "\"你又在想什么\" × \"第三步\"", "WEEKLY": "\"全班安静\" × \"他今天心情不好\"" },
  "MILKTEA": { "MILKTEA": "双倍小太阳", "JIAHAO": "脑洞 × 零食", "BANDIT": "零食窝点 × 藏匿点", "SPOILER": "投喂官 × 干饭人", "PUPPY": "双倍快乐", "LEADER": "零食供应链 × 项目经理", "ZXF": "\"多吃点\" × \"听我的\"", "GENIUS": "零食 × 错题本", "DORM": "小太阳 × 暖宝宝", "DREAMER": "\"吃糖吗？\" × 写诗中", "MONITOR": "递糖的 × 递 bug 的", "TOOLBOX": "投喂 × 隐形", "SEWOO": "模特 × 画师（画不完版）", "SCHEMER": "\"吃吗？\" × \"我在规划\"", "WEEKLY": "\"你心情不好？\" × \"你怎么知道\"" },
  "JIAHAO": { "JIAHAO": "脑洞二重奏", "BANDIT": "策划 × 执行（违规版）", "SPOILER": "\"我有个想法\" × \"干！\"", "PUPPY": "显眼包二重奏", "LEADER": "创意总监 × CEO", "ZXF": "\"我觉得可以\" × \"听我的\"", "GENIUS": "吵死全班的 × 卷死全班的", "DORM": "策划 × 后勤", "DREAMER": "脑洞 × 诗", "MONITOR": "点子 × 算法", "TOOLBOX": "\"我有个想法\" × \"哦\"", "SEWOO": "剧本 × 分镜", "SCHEMER": "想太多的 × 想太远的", "WEEKLY": "\"你觉得咋样？\" × \"他喜欢你\"" },
  "BANDIT": { "BANDIT": "双匪汇合", "SPOILER": "拆门二人组", "PUPPY": "带头搞事 × 带头笑场", "LEADER": "法外狂徒 × 项目总监", "ZXF": "\"听我的\" × \"我不\"", "GENIUS": "\"我有个漏洞\" × \"我算过了\"", "DORM": "案发现场 × 目击证人", "DREAMER": "\"敢不敢\" × \"随你\"", "MONITOR": "黑客 × 网管", "TOOLBOX": "搞事 × 善后", "SEWOO": "\"画个假的\" × \"被抓了别说我\"", "SCHEMER": "军师 × 参谋", "WEEKLY": "\"没人发现吧\" × \"我看见了\"" },
  "SPOILER": { "SPOILER": "双门杀手", "PUPPY": "行动派 × 气氛组", "LEADER": "先跑再说 × 先计划再跑", "ZXF": "\"你慢点\" × \"我冲了\"", "GENIUS": "\"跑！\" × \"等等，我算算\"", "DORM": "拆门专业户 × 报销专业户", "DREAMER": "\"走啊！\" × \"我想看月亮\"", "MONITOR": "\"快！\" × \"我在写脚本\"", "TOOLBOX": "拆 × 修", "SEWOO": "\"别画了，打球！\" × \"马上\"", "SCHEMER": "\"先干！\" × \"先想\"", "WEEKLY": "\"我拆的！\" × \"我看见了\"" },
  "PUPPY": { "PUPPY": "快乐核爆", "LEADER": "\"哈哈哈哈\" × \"别吵我在想事\"", "ZXF": "\"加油！\" × \"你也要加油\"", "GENIUS": "\"哈哈哈哈\" × \"小点声，我在刷题\"", "DORM": "\"开心点！\" × \"嗯\"", "DREAMER": "\"快看晚霞！\" × \"我看到了\"", "MONITOR": "线上话痨 × 线下话痨", "TOOLBOX": "\"你咋不说话！\" × \"……\"", "SEWOO": "模特 × 画师（抓拍版）", "SCHEMER": "\"哈哈哈哈\" × \"我算算\"", "WEEKLY": "\"你今天不开心！\" × \"你怎么知道\"" },
  "LEADER": { "LEADER": "双 CEO 峰会", "ZXF": "战略会 × 咨询会", "GENIUS": "双卷王", "DORM": "\"执行！\" × \"好\"", "DREAMER": "五年规划 × 活在当下", "MONITOR": "CEO × CTO", "TOOLBOX": "\"这事交给你\" × \"好\"", "SEWOO": "甲方 × 乙方", "SCHEMER": "双军师", "WEEKLY": "\"我需要数据\" × \"我观察到了\"" },
  "ZXF": { "ZXF": "双咨询师", "GENIUS": "\"这个专业不行\" × \"我算过了\"", "DORM": "\"听我的\" × \"好\"", "DREAMER": "\"现实一点\" × \"我要去远方\"", "MONITOR": "\"选这个\" × \"我分析了概率\"", "TOOLBOX": "人生规划师 × 后勤部长", "SEWOO": "\"这专业没前途\" × \"可我喜欢\"", "SCHEMER": "双军师·加强版", "WEEKLY": "\"你适合这个\" × \"我早知道了\"" },
  "GENIUS": { "GENIUS": "图书馆双雄", "DORM": "热牛奶 × 错题本", "DREAMER": "精确到分钟 × 活在晚霞里", "MONITOR": "双算法", "TOOLBOX": "一学期说了三句话", "SEWOO": "卷王 × 摸鱼艺术家", "SCHEMER": "双军师·卷版", "WEEKLY": "错题本 × 观察笔记" },
  "DORM": { "DORM": "双暖宝宝", "DREAMER": "热牛奶 × 诗", "MONITOR": "\"多穿点\" × \"好的\"", "TOOLBOX": "两个隐形照顾者", "SEWOO": "\"交稿了\" × \"马上\"", "SCHEMER": "\"休息一下\" × \"我规划好了\"", "WEEKLY": "\"你不开心吧\" × \"你怎么知道\"" },
  "DREAMER": { "DREAMER": "双诗人", "MONITOR": "诗 × 代码", "TOOLBOX": "看晚霞的 × 修投影仪的", "SEWOO": "双艺术家", "SCHEMER": "军师与诗人", "WEEKLY": "日记 × 观察笔记" },
  "MONITOR": { "MONITOR": "双代码", "TOOLBOX": "网管 × 后勤", "SEWOO": "代码 × 插画", "SCHEMER": "CTO × 军师", "WEEKLY": "线上话痨 × 线下观察者" },
  "TOOLBOX": { "TOOLBOX": "双隐形", "SEWOO": "修东西的 × 画东西的", "SCHEMER": "执行者 × 军师", "WEEKLY": "隐形人 × 观察者" },
  "SEWOO": { "SEWOO": "双拖稿", "SCHEMER": "画师 × 甲方", "WEEKLY": "色彩 × 人心" },
  "SCHEMER": { "SCHEMER": "双军师·终极版", "WEEKLY": "军师 × 情报员" },
  "WEEKLY": { "WEEKLY": "双情报局" },
}

// ─── 双向特例（A×B 与 B×A 展示不同称号）───
const MATCH_TITLE_REVERSED: Record<string, Record<string, { forward: string; backward: string }>> = {
  MEOW: {
    PUPPY: { forward: '高冷猫 × 他的饲养员', backward: '饲养员和她的高冷猫' },
    DASI: { forward: '高冷不超过三秒', backward: '一碗饭收买全宇宙' },
  },
  HEAD: {
    BANDIT: { forward: '教导主任 × 黑名单常客', backward: '黑名单常客 × 教导主任' },
    DREAMER: { forward: '罚站搭子', backward: '罚站搭子·反向' },
  },
  SPOILER: { DORM: { forward: '拆门专业户 × 报销专业户', backward: '报销专业户 × 拆门专业户' } },
  BANDIT: {
    PUPPY: { forward: '带头搞事 × 带头笑场', backward: '笑场 × 搞事' },
    SCHEMER: { forward: '军师 × 参谋', backward: '参谋 × 军师' },
  },
  LEADER: { PUPPY: { forward: '"哈哈哈哈" × "别吵我在想事"', backward: '"别吵我在想事" × "哈哈哈哈"' } },
  GENIUS: { JIAHAO: { forward: '吵死全班的 × 卷死全班的', backward: '卷死全班的 × 吵死全班的' } },
  MONITOR: {
    MILKTEA: { forward: '递糖的 × 递 bug 的', backward: '递 bug 的 × 递糖的' },
    PUPPY: { forward: '线上话痨 × 线下话痨', backward: '线下话痨 × 线上话痨' },
  },
  ZXF: { DREAMER: { forward: '"现实一点" × "我要去远方"', backward: '"我要去远方" × "现实一点"' } },
  '####': { PUPPY: { forward: '快乐不分类', backward: '不分类的快乐' } },
  SEWOO: { JIAHAO: { forward: '剧本 × 分镜', backward: '分镜 × 剧本' } },
  SCHEMER: { DREAMER: { forward: '想太多的 × 想太远的', backward: '想太远的 × 想太多的' } },
  TOOLBOX: { MILKTEA: { forward: '投喂 × 隐形', backward: '隐形 × 投喂' } },
  WEEKLY: { MEOW: { forward: '互相偷看一学期', backward: '偷看 × 被发现' } },
  PUPPY: { SPOILER: { forward: '行动派 × 气氛组', backward: '气氛组 × 行动派' } },
  DASI: { JIAHAO: { forward: '天生一对 ⭐', backward: '天生一对·番外' } },
  DORM: { MILKTEA: { forward: '小太阳 × 暖宝宝', backward: '暖宝宝 × 小太阳' } },
}

// quick 模式 4 型名称（称号表只覆盖 19 个完整人格，quick 配对走此映射兜底）
const QUICK_TYPE_NAMES: Record<string, string> = {
  OG: '运营主管', OV: '策划师', RG: '档案管理员', RV: '研究员',
}

/** 兜底命名：任何组合都有称号（quick 模式结果用类型名，避免生硬 code） */
function fallbackTitle(codeA: string, codeB: string): string {
  if (codeA === codeB) return '同类相吸'
  const na = QUICK_TYPE_NAMES[codeA] || codeA
  const nb = QUICK_TYPE_NAMES[codeB] || codeB
  return na + ' × ' + nb
}

/** 查询组合称号（双向特例优先，其次手写表双向，最后兜底） */
export function getMatchTitle(codeA: string, codeB: string): MatchTitleResult {
  const special = MATCH_TITLE_REVERSED[codeA]?.[codeB]
  if (special) return { title: special.forward }
  const specialB = MATCH_TITLE_REVERSED[codeB]?.[codeA]
  if (specialB) return { title: specialB.backward, reversed: true }
  const t = MATCH_TITLES[codeA]?.[codeB] || MATCH_TITLES[codeB]?.[codeA]
  if (t) return { title: t }
  return { title: fallbackTitle(codeA, codeB) }
}

// ─── 默契等级 ───
export interface MatchLevel {
  key: string
  name: string
  min: number
  emoji: string
  desc: string
}

export const MATCH_LEVELS: MatchLevel[] = [
  { key: 'soulmate', name: '天作之合', min: 90, emoji: '💞', desc: '全频道都酸了，这默契是开过光的' },
  { key: 'partner', name: '默契搭档', min: 80, emoji: '🤝', desc: '一个眼神就能接住对方的话' },
  { key: 'acquaintance', name: '点头之交', min: 65, emoji: '👀', desc: '认识，但还需要多点几次头' },
  { key: 'stranger', name: '路人', min: 0, emoji: '🚶', desc: '擦肩而过，相忘于走廊' },
]

export function getMatchLevel(levelKey: string): MatchLevel {
  return MATCH_LEVELS.find(l => l.key === levelKey) || MATCH_LEVELS[MATCH_LEVELS.length - 1]!
}

// ─── 稀有组合彩蛋 ───
export interface RareCombo {
  codeA: string
  codeB: string
  title: string
  rarity: 'legendary' | 'hidden'
  tip: string
}

export const RARE_COMBOS: RareCombo[] = [
  { codeA: 'DASI', codeB: 'JIAHAO', title: '天生一对', rarity: 'legendary', tip: '官方钦定 CP，全频道唯一指定' },
  { codeA: 'MEOW', codeB: 'WEEKLY', title: '窗台双猫', rarity: 'hidden', tip: '两只猫的互相偷看，稀有' },
  { codeA: 'MEOW', codeB: 'DASI', title: '高冷不超过三秒', rarity: 'hidden', tip: '隐藏款聚会：一碗饭收买全宇宙' },
  { codeA: 'MEOW', codeB: '####', title: '两只无法解析的存在', rarity: 'hidden', tip: '隐藏款聚会：系统都放弃了' },
  { codeA: 'DASI', codeB: '####', title: '系统无法解析的干饭人', rarity: 'hidden', tip: '隐藏款聚会：无法归类，无法不干饭' },
]

export function getRareCombo(codeA: string, codeB: string): RareCombo | null {
  return RARE_COMBOS.find(r =>
    (r.codeA === codeA && r.codeB === codeB) || (r.codeA === codeB && r.codeB === codeA)
  ) || null
}

// ─── 校园双人推荐（适合一起做的事）───
export function getActivityRecommendations(matchData: any): string[] {
  const algo = matchData?.algorithm
  if (algo === 'nfti') {
    const sim = matchData.sim || 0
    const comp = matchData.comp || 0
    if (comp > sim + 15) {
      return [
        '一起办活动：一个出点子一个兜底，班主任都不用操心',
        '社团互补组队：一个台前一个幕后，招新现场绝配',
        '自习搭子：一个负责讲，一个负责查漏，效率翻倍',
      ]
    }
    if (sim > comp + 15) {
      return [
        '一起自习：同频的人连翻书节奏都一致',
        '同款社团双人组：报名表上写俩人，稳进',
        '互相监督打卡：卷的方向都一样，谁也别说谁',
      ]
    }
    return [
      '一起吃饭：聊得来，但注意别抢同一个窗口',
      '交换歌单/书单：品味有差异，正好互相种草',
      '约跑校园：一个快一个慢，最后一起走到小卖部',
    ]
  }
  if (algo === 'holland') {
    const same = matchData.aCode && matchData.bCode && matchData.aCode[0] === matchData.bCode[0]
    if (same) {
      return ['同款兴趣搭子：竞赛组队直接锁死', '同一个社团双人报名，社长狂喜', '一起研究同一方向，卷成队友']
    }
    return ['互补兴趣：互相带对方体验自己的领域', '一个修一个懂：组队参加科技节稳了', '跨界搭子：一个学文一个学理，作业互帮']
  }
  return ['跨测评组合：互相体验对方的人格世界', '一起聊聊测试结果，看看谁猜得准', '组队参加活动，一个负责计划一个负责执行']
}

// ─── 分享文案模板 ───
export function buildMatchShareText(aName: string, bName: string, title: string, score: number, levelName: string): string {
  return `我和 ${aName} 的默契度测试结果：${title}，默契度 ${score} 分（${levelName}）💞\n\n你也来测测你和朋友的默契 → https://nfti.weaxi.cn/match`
}
