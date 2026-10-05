// 霍兰德职业测评 · 南方中学校园题库（v5）
// 48 题 Likert 量表，每维度 8 题（6正 + 2反），反向题 scorer 做 6-val 翻转
// 正向：非常像我=高分；反向：非常像我=低分

import type { HollandDimension } from '@/types/holland'

export interface HollandQuestion {
  id: number
  text: string
  dimension: HollandDimension
  /** 反向题：非常像我 → 该维度低分。scorer 会做 6-val 翻转 */
  reversed?: boolean
}

export const hollandQuestions: HollandQuestion[] = [
  // ═══ R 型 — 动手/实操（6正 + 2反）═══
  { id: 1, text: '分组实验器材出了点小毛病，你下意识先自己鼓捣两下，不会立刻举手叫老师。', dimension: 'R' },
  { id: 2, text: '体育课借的球你还回去之前会检查一下有没有漏气、有没有粘泥。', dimension: 'R' },
  { id: 3, text: '拿到新的实体物件——教具、模型、运动装备，你第一反应是翻过来看构造、上手摸。说明书是后来才翻的。', dimension: 'R' },
  { id: 4, text: '大扫除的时候，搬桌子、擦吊扇、通水槽这些出力气的活你会主动选。整理讲台和排桌椅让你觉得不够带劲。', dimension: 'R' },
  { id: 5, text: '手工课材料一发下来你就开始动手了，基本是全班前几个做完的。', dimension: 'R' },
  { id: 6, text: '劳动课做了一把小木凳。别人做完就走了，你留下来又打磨了一遍。看着东西在自己手里一点点变好，你觉得很踏实。', dimension: 'R' },
  { id: 7, text: '化学实验课分组，你希望搭档负责操作仪器，自己更愿意在旁边记录数据。', dimension: 'R', reversed: true },
  { id: 8, text: '教室的椅子腿松了半个学期，你从没想过自己修。每次都绕开坐，等别人报修。', dimension: 'R', reversed: true },

  // ═══ I 型 — 研究/分析（6正 + 2反）═══
  { id: 9, text: '食堂有道菜特别受欢迎，别人都在说好吃，只有你在想它到底是怎么做出来的。', dimension: 'I' },
  { id: 10, text: '需要做重要选择的时候——比如选科、选社团、选比赛方向——你会自己查数据对比，很少跟着别人选。', dimension: 'I' },
  { id: 11, text: '老师上课随口说了一句"这个以后再说"。到了下节课，你会观察老师是否还记得TA说的"以后"。', dimension: 'I' },
  { id: 12, text: '每次成绩出来，你不光看自己考了多少分，还会去看年级排名分布、各科平均分、和上次比有什么变化。', dimension: 'I' },
  { id: 13, text: '频道有人说"某某老师教得不好"。你第一反应是问：具体哪里不好，有什么例子吗。', dimension: 'I' },
  { id: 14, text: '你的心得、报告、分析类作业常常比别人长一截。不是刻意写多，是一展开就收不住。', dimension: 'I' },
  { id: 15, text: '"你为什么这么想？""没怎么想，就感觉吧。"大部分时候你真的是这样。', dimension: 'I', reversed: true },
  { id: 16, text: '一道题做对了你就直接跳过，不太关心为什么对。', dimension: 'I', reversed: true },

  // ═══ A 型 — 创作/表达（6正 + 2反）═══
  { id: 17, text: '如果频道的漂流本传到你手里，你不会只写一句话就走。你会画一页，或者写一首诗，或者贴一张拍立得。', dimension: 'A' },
  { id: 18, text: '艺术节三独比赛，你不上台，但全程盯着舞台配色、灯光和选手的服装搭配。好看的你会记住，不好看的也会。', dimension: 'A' },
  { id: 19, text: '语文课分组展示。别人做PPT，你们组决定演一折短剧，改写台词的部分是你主动揽的。', dimension: 'A' },
  { id: 20, text: '班级文化墙空了三年没人管。你接手后，排版、配色、插画、互动留言区全重新做了。路过的同学开始停下来看。', dimension: 'A' },
  { id: 21, text: '你的课本空白处永远有东西——涂鸦、歌词、随手写的句子。手就是闲不住。', dimension: 'A' },
  { id: 22, text: '你看完一本书或者一部电影之后，会忍不住写点什么。哪怕只是几行字，不写下来觉得白看了。', dimension: 'A' },
  { id: 23, text: '东西好不好看你觉得没那么重要，能用就行。', dimension: 'A', reversed: true },
  { id: 24, text: '全班都在用同样的方式展示。你觉得挺好的，不需要想新的。', dimension: 'A', reversed: true },

  // ═══ S 型 — 助人/共情（6正 + 2反）═══
  { id: 25, text: '新同学端着盘子站那不知道该坐哪。你招了招手："这边有空位。"', dimension: 'S' },
  { id: 26, text: '频道有人问了一个很基础的问题，下面没人回。你是第一个认真回复的。', dimension: 'S' },
  { id: 27, text: '同桌今天话比平时少。你察觉到了，问了句"怎么了"，然后等着TA回答。', dimension: 'S' },
  { id: 28, text: '你大概知道班上谁对什么过敏、谁下周过生日、谁最近心情不太好。', dimension: 'S' },
  { id: 29, text: '哪怕只是借了支笔、指了条路，帮了别人一个忙之后你心里会亮一下。', dimension: 'S' },
  { id: 30, text: '团队里来了个新人，你主动带TA走了一圈：食堂哪个窗口好吃、小卖部在哪、操场几点人少。', dimension: 'S' },
  { id: 31, text: '管好自己的事就够了，你觉得别人的烦恼跟你关系不大。', dimension: 'S', reversed: true },
  { id: 32, text: '朋友说"我没事"，你就真的觉得没事了，不会追问第二句。', dimension: 'S', reversed: true },

  // ═══ E 型 — 领导/推动（6正 + 2反）═══
  { id: 33, text: '群里有人提议一件事，几十条"+1"后没人动。通常你是那个站出来拉群、定时间、@所有人的人。', dimension: 'E' },
  { id: 34, text: '运动会报名，有个项目还缺一个人。你举了手，不是跑得快，只是不想空着。', dimension: 'E' },
  { id: 35, text: '社团招新摆摊。别人挂张海报就坐下，你站过道中间喊了一下午。', dimension: 'E' },
  { id: 36, text: '小组讨论卡住了没人说话，你第一个开口："要不我们先定个方向？"', dimension: 'E' },
  { id: 37, text: '你喜欢说服别人——不是吵架那种，是把想法讲清楚，让对方点头说"有道理"。', dimension: 'E' },
  { id: 38, text: '做决定的时候你比较快，不需要把所有可能性都算一遍才敢动。', dimension: 'E' },
  { id: 39, text: '团队里有人说"我来负责"。你松了一口气，跟着做就行了。', dimension: 'E', reversed: true },
  { id: 40, text: '班会上讨论事情，你习惯先听一圈别人怎么说，最后再决定自己站哪边。', dimension: 'E', reversed: true },

  // ═══ C 型 — 规范/条理（6正 + 2反）═══
  { id: 41, text: '你的笔记本按科目分颜色：数学蓝、语文绿、英语黄。翻开任何一页，标题、日期、重点标记的格式都一样。', dimension: 'C' },
  { id: 42, text: '班级图书角乱成一堆，你特别想做个借阅登记表。不是老师要求的，就是看着难受。', dimension: 'C' },
  { id: 43, text: '学考报名系统一开放，频道求助区就炸了。你花时间写了份图文教程，步骤、截图、常见问题全都标清楚了。', dimension: 'C' },
  { id: 44, text: '你在群里发消息，分段、标点都很讲究。怕别人看不懂。', dimension: 'C' },
  { id: 45, text: '截止日期前你一般提前一两天就搞完了。不是卷，就是不喜欢赶。', dimension: 'C' },
  { id: 46, text: '整理数据、核对名单、归档文件，有条有理地推进你会觉得安心。别人觉得枯燥的事你觉得清爽。', dimension: 'C' },
  { id: 47, text: '计划永远赶不上变化，所以你一般不做计划，到跟前再说。', dimension: 'C', reversed: true },
  { id: 48, text: '别人问你怎么安排复习，你说看情况吧，到考前再说。提前把每一步都想好不是你的风格。', dimension: 'C', reversed: true },
]

export const HOLLAND_TOTAL = hollandQuestions.length
