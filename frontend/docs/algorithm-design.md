# MBTI / SBTI 人格测试算法实现设计文档

> **文档版本**: v1.0
> **创建日期**: 2026-06-10
> **文档类型**: 算法设计与技术规范
> **适用范围**: nfBTI 项目人格测试模块

---

## 目录

1. [算法原理概述](#1-算法原理概述)
2. [计分算法详细设计](#2-计分算法详细设计)
3. [快速测试 vs 完整测试的算法差异](#3-快速测试-vs-完整测试的算法差异)
4. [隐藏款/彩蛋人格触发算法](#4-隐藏款彩蛋人格触发算法)
5. [伪代码实现](#5-伪代码实现)
6. [参考资源与链接](#6-参考资源与链接)

---

## 1. 算法原理概述

### 1.1 MBTI 四维八极模型

MBTI（Myers-Briggs Type Indicator）基于卡尔·荣格的心理类型理论，通过**四个二元维度**来描述人格偏好。每个维度包含两个对立的极（pole），共**八个极**（eight poles）：

| 维度 | 正极 | 负极 | 心理功能 | 核心问题 |
|------|------|------|----------|----------|
| **E/I** | 外向 (Extraversion) | 内向 (Introversion) | 注意力指向 | 能量从哪里获取？ |
| **S/N** | 感觉 (Sensing) | 直觉 (iNtuition) | 信息获取方式 | 如何接收信息？ |
| **T/F** | 思维 (Thinking) | 情感 (Feeling) | 决策方式 | 如何做决定？ |
| **J/P** | 判断 (Judging) | 感知 (Perceiving) | 生活态度 | 如何对待外部世界？ |

#### 1.1.1 各维度详细解释

**维度一：E/I - 能量来源**
- **E (外向)**: 从外部世界和人际交往中获取能量，喜欢行动、表达、群体活动
- **I (内向)**: 从内心世界和独处思考中恢复能量，喜欢反思、深度、独立工作
- *关键区别*: 不是社交能力的差异，而是能量补充方式的差异

**维度二：S/N - 信息收集**
- **S (感觉)**: 关注具体细节、事实、现实、五感体验，相信经验数据
- **N (直觉)**: 关注整体模式、可能性、未来、抽象概念，相信灵感和联想
- *关键区别*: "看到的是树木还是森林"

**维度三：T/F - 决策依据**
- **T (思维)**: 基于逻辑分析、客观标准、因果关系、原则规则
- **F (情感)**: 基于个人价值、他人感受、和谐关系、人文关怀
- *关键区别*: "头脑还是心在做决定"

**维度四：J/P - 生活方式**
- **J (判断)**: 喜欢计划、结构、确定性、提前完成、有条理
- **P (感知)**: 喜欢灵活、开放性、保留选项、临场发挥、随性
- *关键区别*: "控制生活还是让生活发生"

### 1.2 传统计分方式对比

#### 方式一：强制选择法（Force Choice）

**原理**: 每道题提供 A/B 两个陈述句，用户必须选择更符合自己的一个。

```
示例题目：
A. 我说话的速度经常比我想的要快。
B. 有时我想了很久，却什么也没说。
用户选择: [A] → E维度 +1 分
         [B] → I维度 +1 分
```

**优点**:
- 避免中间立场，强制表态
- 计算简单直观
- 降低"社会称许性"偏差（用户无法选择看起来都好的答案）

**缺点**:
- 信息粒度粗糙，只有二值选择
- 无法测量倾向强度
- 可能造成用户心理不适（被迫选不完全符合的选项）

#### 方式二：Likert 量表法（推荐）✓

**原理**: 每道题是一个陈述句，用户在 6 级同意度量表上作答。

```
示例题目：
"我喜欢参加大型聚会和社交活动"
[非常不同意] [不同意] [有点不同意] [有点同意] [同意] [非常同意]
   (-3)        (-2)      (-1)        (+1)      (+2)     (+3)
```

**优点**:
- 测量连续性的倾向强度
- 数据丰富度高，适合统计分析
- 用户心理舒适度好
- 可检测回答一致性（反向题验证）

**缺点**:
- 实现复杂度略高
- 需要设计正向/反向题平衡

### 1.3 从用户选项到最终结果的完整数据流

```
┌─────────────────────────────────────────────────────────────┐
│                     用户测试流程                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 步骤1: 加载题库                                               │
│   questions.json → [{id, text, dimension, direction, ...}]    │
│   快速模式: 提取12题子集                                      │
│   完整模式: 使用全部48/93题                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 步骤2: 用户答题                                               │
│   answers = [{questionId: 1, value: 2}, ...]                 │
│   value ∈ {-3, -2, -1, +1, +2, +3}                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 步骤3: 维度得分计算                                           │
│   calculateDimensionScores(answers, questions)               │
│   → {E: 15, I: -8, S: 5, N: -3, T: 12, F: -6, J: 9, P: -4} │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 步骤4: 类型判定                                               │
│   determinePersonalityType(scores)                           │
│   → 比较 E vs I, S vs N, T vs F, J vs P                      │
│   → 取每对中得分较高的极                                      │
│   → 组合为4字母类型码 (如 "ENTJ")                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 步骤5: 彩蛋检测（可选）                                        │
│   checkHiddenType(scores, answers)                           │
│   → 如果触发隐藏条件 → 返回特殊类型                            │
│   → 否则 → 返回标准结果                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 步骤6: 结果渲染                                               │
│   返回 {type: "ENTJ", scores: {...}, description: "..."}      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 计分算法详细设计

### 2.1 题目数据结构定义

```typescript
interface Question {
  id: number;                    // 题目唯一标识
  text: string;                  // 题目文本内容
  dimension: 'EI' | 'SN' | 'TF' | 'JP';  // 所属维度对
  /**
   * direction 字段作用：
   * - 'positive': 用户同意(+分)时，正极(E/S/T/J)得分增加
   * - 'negative': 用户同意(+分)时，负极(I/N/F/P)得分增加
   *
   * 示例：
   * 题目:"我喜欢参加聚会" dimension=EI direction=positive
   *   → 用户选+3 → E得+3分
   *
   * 题目:"我更喜欢独自待着" dimension=EI direction=negative
   *   → 用户选+3 → I得+3分 (因为direction是negative)
   */
  direction: 'positive' | 'negative';
  category?: string;             // 可选的分类标签（如"校园版"、"职场版"）
  isHidden?: boolean;            // 是否为隐藏彩蛋题
  hiddenTrigger?: HiddenTriggerConfig; // 触发条件配置
}
```

### 2.2 正向/反向计分机制详解

#### 核心公式

```javascript
// 对于第 i 道题的回答
let rawScore = answers[i].value;  // 范围: [-3, -2, -1, +1, +2, +3]

// 根据 direction 确定实际加分到哪个极
if (questions[i].direction === 'positive') {
  // 正向题: 同意 → 正极得分
  if (rawScore > 0) {
    scores[positivePole] += rawScore;  // 如 E, S, T, J
  } else {
    scores[negativePole] += Math.abs(rawScore);  // 如 I, N, F, P
  }
} else {
  // 反向题: 同意 → 负极得分（语义反转）
  if (rawScore > 0) {
    scores[negativePole] += rawScore;
  } else {
    scores[positivePole] += Math.abs(rawScore);
  }
}
```

#### 具体示例

**示例 1: 正向题**

```
题目ID: 1
文本: "我在社交场合感到精力充沛"
维度: EI
方向: positive (同意→E得分)

用户回答: +2 (同意)

计算:
  E += 2
  结果: E=2, I=0
```

**示例 2: 反向题**

```
题目ID: 2
文本: "长时间的社交活动会让我精疲力竭"
维度: EI
方向: negative (同意→I得分，语义反转)

用户回答: +3 (非常同意)

计算:
  I += 3
  结果: E=2, I=3
```

**为什么需要反向题？**
- **防止默认偏差**: 有些用户习惯性选择右侧选项
- **检测一致性**: 正反两题答案矛盾说明用户未认真作答
- **平衡语义**: 避免"社会称许性"效应（如所有题都选看起来正向的选项）
- **提高信度**: Cronbach's α 系数通常需要正反题搭配才能达到 0.8+

### 2.3 Likert 6级量表的数值映射

本系统采用**无中性点的偶数级量表**（6级），避免用户倾向于选择中间项：

```
┌──────────────────────────────────────────────────────────────────┐
│                    Likert 6级量表映射表                           │
├──────────┬────────────────┬──────────┬───────────────────────────┤
│  选项文本 │ 显示标签       │ 数值     │ 含义说明                   │
├──────────┼────────────────┼──────────┼───────────────────────────┤
│ 选项1    │ 非常不同意      │   -3     │ 强烈反对该陈述             │
│ 选项2    │ 不同意          │   -2     │ 较强反对                   │
│ 选项3    │ 有点不同意      │   -1     │ 轻微反对                   │
│ 选项4    │ 有点同意        │   +1     │ 轻微赞同                   │
│ 选项5    │ 同意            │   +2     │ 较强赞同                   │
│ 选项6    │ 非常同意        │   +3     │ 强烈赞同该陈述             │
└──────────┴────────────────┴──────────┴───────────────────────────┘
```

**设计考量**:

1. **为何不用5级或7级（奇数级）?**
   - 奇数级有明确的中立点（如"一般/不确定"）
   - 大量研究显示，提供中立选项会导致 30-50% 的用户选择中立
   - 这降低了数据的区分度和有效性
   - 6级量表**强迫用户表态**，提高数据质量

2. **数值范围 [-3, +3] 的意义**
   - 对称设计，零点两侧各有3个等级
   - 单题最大贡献 ±3 分
   - 48题完整版单维度最大理论得分: 12题 × 3分 = ±36 分
   - 93题标准版单维度最大理论得分: 23题 × 3分 = ±69 分

3. **跳过0分的理由**
   - 避免用户"骑墙"，迫使做出微弱判断
   - 符合MBTI理论核心：**偏好是相对的，不存在绝对中立**

### 2.4 维度得分聚合公式

#### 数学表达

设题库中共有 $N$ 道题，其中属于维度对 $D \in \{EI, SN, TF, JP\}$ 的题目集合为 $Q_D$。

对于维度对 $D$ 的两个极 $D^+$ 和 $D^-$（例如 $E$ 和 $I$）：

$$Score(D^+) = \sum_{q \in Q_D} \begin{cases} v_q & \text{if } dir_q = \text{positive} \land v_q > 0 \\ |v_q| & \text{if } dir_q = \text{negative} \land v_q < 0 \\ 0 & \text{otherwise} \end{cases}$$

$$Score(D^-) = \sum_{q \in Q_D} \begin{cases} v_q & \text{if } dir_q = \text{negative} \land v_q > 0 \\ |v_q| & \text{if } dir_q = \text{positive} \land v_q < 0 \\ 0 & \text{otherwise} \end{cases}$$

其中：
- $v_q$ 是用户对题目 $q$ 的回答值，$v_q \in \{-3, -2, -1, +1, +2, +3\}$
- $dir_q$ 是题目 $q$ 的方向属性

#### JavaScript 实现

```javascript
function calculateDimensionScores(answers, questions) {
  // 初始化8个极的得分
  const scores = {
    E: 0, I: 0,
    S: 0, N: 0,
    T: 0, F: 0,
    J: 0, P: 0
  };

  // 维度对映射
  const dimensionMap = {
    'EI': { positive: 'E', negative: 'I' },
    'SN': { positive: 'S', negative: 'N' },
    'TF': { positive: 'T', negative: 'F' },
    'JP': { positive: 'J', negative: 'P' }
  };

  // 遍历每个回答
  for (const answer of answers) {
    const question = questions.find(q => q.id === answer.questionId);
    if (!question) continue;

    const value = answer.value;
    const dimPair = dimensionMap[question.dimension];
    const { positive: posPole, negative: negPole } = dimPair;

    if (question.direction === 'positive') {
      // 正向题: 同意→正极得分
      if (value > 0) {
        scores[posPole] += value;
      } else {
        scores[negPole] += Math.abs(value);
      }
    } else {
      // 反向题: 同意→负极得分（语义反转）
      if (value > 0) {
        scores[negPole] += value;
      } else {
        scores[posPole] += Math.abs(value);
      }
    }
  }

  return scores;
}
```

### 2.5 类型判定规则

#### 基本判定逻辑

对每个维度对，比较两个极的得分，取高分者：

```javascript
function determinePersonalityType(scores) {
  let type = '';

  // 维度1: E vs I
  type += (scores.E >= scores.I) ? 'E' : 'I';

  // 维度2: S vs N
  type += (scores.S >= scores.N) ? 'S' : 'N';

  // 维度3: T vs F
  type += (scores.T >= scores.F) ? 'T' : 'F';

  // 维度4: J vs P
  type += (scores.J >= scores.P) ? 'J' : 'P';

  return type;
}
```

#### 边界情况处理：平分时的默认倾向

当某维度对的两个极得分完全相等时（`score[pos] === score[neg]`），采用以下策略：

**策略A: 默认正极优先（推荐）**
```javascript
// 使用 >= 而非 >，平分时默认取正极
type += (scores.E >= scores.I) ? 'E' : 'I';  // 平分→E
```

**理由**:
- 统计学上，外向型在人群中占比约 50-60%（略高于内向）
- 保持判定结果的确定性和可复现性
- 避免随机性导致的用户体验不一致

**策略B: 引入弱倾向标记（高级方案）**
```javascript
function getTypeWithClarity(scores) {
  const result = {
    type: '',
    clarity: {} as Record<string, 'strong' | 'moderate' | 'weak'>
  };

  const pairs = [
    { pos: 'E', neg: 'I', label: 'EI' },
    { pos: 'S', neg: 'N', label: 'SN' },
    { pos: 'T', neg: 'F', label: 'TF' },
    { pos: 'J', neg: 'P', label: 'JP' }
  ];

  for (const pair of pairs) {
    const diff = Math.abs(scores[pair.pos] - scores[pair.neg]);
    const total = scores[pair.pos] + scores[pair.neg];

    if (scores[pair.pos] >= scores[pair.neg]) {
      result.type += pair.pos;
    } else {
      result.type += pair.neg;
    }

    // 判断倾向清晰度
    if (total === 0 || diff === 0) {
      result.clarity[pair.label] = 'weak';
    } else if (diff / total > 0.5) {
      result.clarity[pair.label] = 'strong';
    } else {
      result.clarity[pair.label] = 'moderate';
    }
  }

  return result;
}

// 输出示例:
// {
//   type: "ENFP",
//   clarity: { EI: "strong", SN: "weak", TF: "moderate", JP: "strong" }
// }
```

**倾向强度分级标准**：

| 差异比例 | 清晰度等级 | 说明 |
|---------|-----------|------|
| diff/total > 70% | **强倾向** | 该维度特征明显，结果可信 |
| 30% ≤ diff/total ≤ 70% | **中等倾向** | 有一定偏向但不够强烈 |
| diff/total < 30% 或 total=0 | **弱倾向** | 几乎中立，可能受状态影响 |

---

## 3. 快速测试 vs 完整测试的算法差异

### 3.1 两种测试模式的定位

| 特征 | 快速测试 | 完整测试 |
|------|---------|---------|
| **题数** | 12 题 | 48 题（或 93 题标准版） |
| **耗时** | 约 2-3 分钟 | 约 8-10 分钟 |
| **覆盖维度** | 仅 E/I 和 S/N | 全部四维度 (E/I, S/N, T/F, J/P) |
| **结果数量** | 4 种组合 | 16 种组合 |
| **准确度** | 中等（适合初筛） | 高（适合正式评估） |
| **使用场景** | 社交分享、快速了解 | 深入自我探索、职业规划 |

### 3.2 快速测试算法（12题 → 4种结果）

#### 设计思路

快速测试只测量**前两个维度**（E/I 和 S/N），这两个维度是最容易自我感知且最常被讨论的：

- **E/I**: "我是社牛还是社恐？" —— 社交场合最常用
- **S/N**: "我是务实派还是脑洞派？" —— 工作/学习风格最相关

后两个维度（T/F 和 J/P）需要更深层的内省，短时间难以准确判断。

#### 题目分配策略

```
12题快速测试分配方案:
├── E/I 维度: 6 题
│   ├── 正向题(E): 3 题
│   └── 反向题(I): 3 题
└── S/N 维度: 6 题
    ├── 正向题(S): 3 题
    └── 反向题(N): 3 题
```

**选题原则**（从48题完整版中精选）：

1. **高区分度**: 选择那些在实际测试中能产生较大分数差异的题目
2. **低歧义**: 避免语义模糊或文化依赖强的题目
3. **场景化**: 优先选择贴近日常生活的情境题
4. **平衡性**: 正反题各半，避免系统性偏差

**推荐快速测试题目示例**（从完整版精选）：

```json
{
  "quickTestQuestions": [
    {"id": "Q_EI_01", "dimension": "EI", "direction": "positive",
     "text": "聚会结束后我通常感到精力充沛而非疲惫"},
    {"id": "Q_EI_02", "dimension": "EI", "direction": "negative",
     "text": "我更喜欢一对一深入交流而不是群体闲聊"},
    {"id": "Q_EI_03", "dimension": "EI", "direction": "positive",
     "text": "在团队工作中我喜欢主动发言和主导讨论"},
    {"id": "Q_SN_01", "dimension": "SN", "direction": "positive",
     "text": "我更关注具体的细节和数据而非宏大的概念"},
    {"id": "Q_SN_02", "dimension": "SN", "direction": "negative",
     "text": "我经常思考事物背后可能的意义和象征"},
    {"id": "Q_SN_03", "dimension": "SN", "direction": "positive",
     "text": "做决定时我依赖过往经验和已知事实"}
    // ... 共12题
  ]
}
```

#### 快速测试结果生成

```javascript
function getQuickTestResult(answers, quickQuestions) {
  // 只计算 E/I 和 S/N 两个维度
  const scores = calculateDimensionScores(answers, quickQuestions);

  // 判定前两个维度
  const eiResult = scores.E >= scores.I ? 'E' : 'I';
  const snResult = scores.S >= scores.N ? 'S' : 'N';

  // 后两个维度用 "xx" 占位或省略
  return {
    type: `${eiResult}${snResult}`,  // 如 "ES", "IN", "EN", "IS"
    fullType: `${eiResult}${snResult}??`,  // 完整格式占位
    mode: 'quick',
    suggestion: `您的快速测试结果是 ${eiResult}${snResult} 型！\n` +
                `如需获取完整的16型人格分析，请尝试48题完整版测试。`,
    scores: {
      EI: { E: scores.E, I: scores.I },
      SN: { S: scores.S, N: scores.N }
    }
  };
}
```

**输出示例**:
```json
{
  "type": "EN",
  "fullType": "EN??",
  "mode": "quick",
  "suggestion": "您的快速测试结果是 EN 型！您可能是 ENTJ 或 ENFP...",
  "scores": {
    "EI": {"E": 14, "I": 3},
    "SN": {"S": 8, "N": 11}
  }
}
```

### 3.3 完整测试算法（48题 → 16种结果）

#### 题目分配策略

```
48题完整测试分配方案:
├── E/I 维度: 12 题 (25%)
│   ├── 正向题(E): 6 题
│   └── 反向题(I): 6 题
├── S/N 维度: 12 题 (25%)
│   ├── 正向题(S): 6 题
│   └── 反向题(N): 6 题
├── T/F 维度: 12 题 (25%)
│   ├── 正向题(T): 6 题
│   └── 反向题(F): 6 题
└── J/P 维度: 12 题 (25%)
    ├── 正向题(J): 6 题
    └── 反向题(P): 6 题
```

**设计原则**:

1. **均衡覆盖**: 四个维度题量相等，确保测量公平性
2. **正反平衡**: 每个维度内部正向/反向题各半，控制偏差
3. **题目质量**: 经过预测试筛选，Cronbach's α ≥ 0.7
4. **本土化**: 语言表述符合中文语境，避免直译生硬感

#### 完整测试结果生成

```javascript
function getFullTestResult(answers, fullQuestions) {
  // 计算全部四个维度得分
  const scores = calculateDimensionScores(answers, fullQuestions);

  // 判定全部四个维度
  const type = determinePersonalityType(scores);

  // 计算每个维度的倾向百分比
  const percentages = calculatePercentages(scores);

  return {
    type: type,                    // 如 "INTJ"
    mode: 'full',
    scores: scores,                // 原始得分
    percentages: percentages,       // 百分比形式
    clarity: analyzeClarity(scores), // 倾向清晰度
    dominantFunction: getDominantFunction(type), // 主导功能
    description: getTypeDescription(type)        // 详细描述
  };
}

function calculatePercentages(scores) {
  return {
    E: calcPercentage(scores.E, scores.I),
    I: calcPercentage(scores.I, scores.E),
    S: calcPercentage(scores.S, scores.N),
    N: calcPercentage(scores.N, scores.S),
    T: calcPercentage(scores.T, scores.F),
    F: calcPercentage(scores.F, scores.T),
    J: calcPercentage(scores.J, scores.P),
    P: calcPercentage(scores.P, scores.J)
  };
}

function calcPercentage(a, b) {
  const total = Math.abs(a) + Math.abs(b);
  if (total === 0) return 50;  // 平分时各占50%
  return Math.round((Math.abs(a) / total) * 100);
}
```

**输出示例**:
```json
{
  "type": "INTJ",
  "mode": "full",
  "scores": {
    "E": 3, "I": 18,
    "S": 5, "N": 16,
    "T": 20, "F": 2,
    "J": 15, "P": 6
  },
  "percentages": {
    "E": 14, "I": 86,
    "S": 24, "N": 76,
    "T": 91, "F": 9,
    "J": 71, "P": 29
  },
  "clarity": {
    "EI": "strong",
    "SN": "strong",
    "TF": "very strong",
    "JP": "moderate"
  }
}
```

### 3.4 信度保障机制

#### 重测一致性检验

根据调研数据，不同题量的重测一致性（3个月间隔）：

| 版本 | 题数 | Cronbach's α | 重测一致性 | 推荐用途 |
|------|------|-------------|-----------|---------|
| 极简版 | 6-12 题 | 0.55-0.65 | 60-70% | 娱乐分享 |
| 精简版 | 40-48 题 | 0.75-0.85 | 80-88% | 一般应用 ✓ |
| 标准版 | 93 题 | 0.86-0.92 | 90-95% | 专业评估 |

**本项目建议**: 采用 48 题精简版作为主要版本，兼顾效率与准确性。

---

## 4. 隐藏款/彩蛋人格触发算法

### 4.1 隐藏款的设计目的

隐藏款人格（Hidden Personality / Easter Egg）是 SBTI 校园版等人格测试的**趣味增强机制**，旨在：

1. **提升传播性**: 稀有结果激发用户分享欲望（"你测出这个了吗？太罕见了！"）
2. **增加复测率**: 用户为了获得隐藏款而反复测试或邀请朋友测试
3. **强化社区话题**: 彩蛋成为社交媒体上的讨论热点
4. **情感共鸣**: 隐藏款通常戳中特定群体的痛点或梗（如"酒鬼DRUNK"、"全园万能胶GLUE"）

### 4.2 已知隐藏款案例

根据公开资料，SBTI 及其变体中的典型隐藏款包括：

| 隐藏代号 | 名称 | 触发率 | 触发条件概述 | 目标群体 |
|----------|------|--------|--------------|----------|
| **DRUNK** | 酒鬼 | ~0.8% | 明确表示爱喝酒 + 隐藏题选中极端选项 | 校园饮酒文化群体 |
| **PE** | 被占课体质 | ~2% | 教师版专属，特定教学困境组合 | 中小学教师 |
| **GLUE** | 全园万能胶 | ~1.5% | 幼教版专属，多任务全能型 | 幼儿园教师 |
| **NPC** | 量产NPC | ~5% | 所有维度均接近中间值，无明显倾向 | 性格平淡群体 |
| **???** | 待发现 | <0.1% | 极特殊的组合模式（官方保密） | 极少数人 |

### 4.3 触发条件设计架构

#### 4.3.1 多层检测模型

```
┌────────────────────────────────────────────────────────────┐
│                    彩蛋检测流程                               │
└────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────┐
│ 第一层: 前置条件过滤                                          │
│   - 必须完成足够数量的题目（如≥40题）                         │
│   - 回答不能过于随机（需通过一致性检验）                       │
│   - 未触发过其他更高优先级的隐藏款                             │
└────────────────────────────────────────────────────────────┘
                           │ (通过)
                           ▼
┌────────────────────────────────────────────────────────────┐
│ 第二层: 维度极值检测                                          │
│   - 某维度得分超过阈值（如 E > 30 或 I < -25）               │
│   - 或某维度对差异极大（如 \|E-I\| > 20）                    │
└────────────────────────────────────────────────────────────┘
                           │ (匹配)
                           ▼
┌────────────────────────────────────────────────────────────┐
│ 第三层: 隐藏题触发                                            │
│   - 在正常题库中插入1-2道隐蔽的特殊题目                       │
│   - 只有满足第二层条件的用户才会看到这些题                     │
│   - 用户必须在隐藏题中选择特定的极端选项                       │
└────────────────────────────────────────────────────────────┘
                           │ (命中)
                           ▼
┌────────────────────────────────────────────────────────────┐
│ 第四层: 概率控制（可选）                                       │
│   - 即使满足上述条件，也仅以一定概率触发                        │
│   - 控制稀有度，维持神秘感和稀缺性                             │
└────────────────────────────────────────────────────────────┘
                           │ (成功)
                           ▼
                    返回隐藏人格结果
```

#### 4.3.2 数据结构定义

```typescript
interface HiddenTriggerConfig {
  hiddenId: string;              // 隐藏款唯一标识，如 "DRUNK"
  name: string;                  // 显示名称
  rarity: number;                // 稀有度 0-100（越小越稀有）
  triggerProbability: number;    // 最终触发概率 0-1（1.0=必触发）

  // 第一层: 前置条件
  prerequisites: {
    minQuestionsAnswered: number;  // 最少答题数
    maxRandomness: number;         // 最大随机性指数（防乱答）
  };

  // 第二层: 维度条件（满足任一即可）
  dimensionConditions: Array<{
    type: 'extreme' | 'balanced' | 'pattern';
    threshold?: number;           // 极值阈值
    pattern?: string[];           // 特定模式（如 ["E_high", "N_high", "P_high"]）
  }>;

  // 第三层: 隐藏题条件
  hiddenQuestionRequirements: {
    questionIds: number[];        // 必须出现的隐藏题ID列表
    requiredAnswers: number[];    // 必须选择的答案值列表
  };

  // 元数据
  metadata: {
    description: string;          // 隐藏款描述文案
    shareImage: string;           // 分享海报图片URL
    flavorText: string;           // 趣味文案（如"正常人一辈子也测不出这个"）
    discoverCount?: number;       // 已被发现次数（用于动态调整概率）
  };
}
```

### 4.4 具体触发算法实现

#### 4.4.1 一致性检验函数

防止用户随机乱答以刷隐藏款：

```javascript
function checkResponseConsistency(answers, questions) {
  /**
   * 检测方法：
   * 1. 找出同一维度的正反题对
   * 2. 如果正向题选+3但反向题也选+3 → 矛盾！
   * 3. 计算矛盾题对占比，超过阈值则判定为乱答
   */

  let contradictions = 0;
  let checkedPairs = 0;

  // 按维度分组
  const dimensionGroups = groupByDimension(questions);

  for (const [dim, qs] of Object.entries(dimensionGroups)) {
    const positiveQuestions = qs.filter(q => q.direction === 'positive');
    const negativeQuestions = qs.filter(q => q.direction === 'negative');

    // 配对比较
    for (const posQ of positiveQuestions) {
      for (const negQ of negativeQuestions) {
        const posAns = answers.find(a => a.questionId === posQ.id);
        const negAns = answers.find(a => a.questionId === negQ.id);

        if (posAns && negAns) {
          checkedPairs++;
          // 如果两道题都是强同意或都是强反对 → 矛盾
          if ((posAns.value > 1 && negAns.value > 1) ||
              (posAns.value < -1 && negAns.value < -1)) {
            contradictions++;
          }
        }
      }
    }
  }

  const inconsistencyRate = checkedPairs > 0
    ? contradictions / checkedPairs
    : 0;

  return {
    isConsistent: inconsistencyRate < 0.3,  // 允许30%的轻微矛盾
    rate: inconsistencyRate,
    message: inconsistencyRate > 0.3
      ? "检测结果存在较多矛盾，建议重新认真作答"
      : null
  };
}
```

#### 4.4.2 主检测函数

```javascript
function checkHiddenType(scores, answers, questions, mode) {
  // 仅在完整模式下检测隐藏款
  if (mode !== 'full') return null;

  // 第一步: 一致性检验
  const consistency = checkResponseConsistency(answers, questions);
  if (!consistency.isConsistent) return null;

  // 第二步: 检查是否满足答题数量要求
  if (answers.length < 40) return null;

  // 第三步: 遍历所有已配置的隐藏款
  const hiddenConfigs = getHiddenConfigs();  // 从配置文件加载

  for (const config of hiddenConfigs) {
    if (tryTriggerHidden(config, scores, answers)) {
      return generateHiddenResult(config, scores);
    }
  }

  return null;  // 未触发任何隐藏款
}

function tryTriggerHidden(config, scores, answers) {
  // 检查前置条件
  if (answers.length < config.prerequisites.minQuestionsAnswered) {
    return false;
  }

  // 检查维度条件
  const dimConditionMet = config.dimensionConditions.some(cond => {
    switch (cond.type) {
      case 'extreme':
        // 检查是否有维度超过极值阈值
        return Object.entries(scores).some(([pole, score]) =>
          Math.abs(score) >= (cond.threshold || 25)
        );

      case 'balanced':
        // 检查所有维度是否都在中间区域
        return Object.values(scores).every(score =>
          Math.abs(score) <= 10
        );

      case 'pattern':
        // 检查是否符合特定模式
        return checkPatternMatch(cond.pattern, scores);

      default:
        return false;
    }
  });

  if (!dimConditionMet) return false;

  // 检查隐藏题条件
  const hiddenQuestionMet = config.hiddenQuestionRequirements.questionIds.every((qId, idx) => {
    const answer = answers.find(a => a.questionId === qId);
    return answer && answer.value === config.hiddenQuestionRequirements.requiredAnswers[idx];
  });

  if (!hiddenQuestionMet) return false;

  // 概率控制
  if (config.triggerProbability < 1.0) {
    const random = Math.random();
    if (random > config.triggerProbability) {
      return false;  // 概率未命中
    }
  }

  return true;  // 所有条件满足，触发成功！
}
```

#### 4.4.3 DRUNK 隐藏款具体实现示例

```javascript
const DRUNK_CONFIG: HiddenTriggerConfig = {
  hiddenId: 'DRUNK',
  name: '🍺 酒鬼',
  rarity: 0.8,  // 0.8%稀有度
  triggerProbability: 0.95,  // 95%概率触发（条件满足时几乎必中）

  prerequisites: {
    minQuestionsAnswered: 45,
    maxRandomness: 0.2
  },

  dimensionConditions: [
    {
      type: 'extreme',
      threshold: 20  // 至少一个维度得分超过±20
    },
    {
      type: 'pattern',
      pattern: ['E_high', 'P_high']  // 高外向+高感知（爱玩爱自由）
    }
  ],

  hiddenQuestionRequirements: {
    questionIds: [999, 1000],  // 两道隐藏题
    requiredAnswers: [+3, +3]  // 都要选"非常同意"
    /*
      隐藏题999: "平时爱好喝酒"
      隐藏题1000: "把白酒装在保温杯里当水喝"
    */
  },

  metadata: {
    description: '你是行走的酒精检测仪，千杯不醉的传说人物。',
    shareImage: '/images/hidden/drunk-poster.png',
    flavorText: '正常人一辈子也测不出这个人格。你必须精准踩中"平时爱好喝酒"，外加隐藏题里"把白酒装在保温杯里当水喝"，才能解锁此成就。',
    discoverCount: 1256  // 已被1256人发现
  }
};
```

### 4.5 隐藏款的优先级与冲突处理

当一个测试可能同时满足多个隐藏款条件时，采用**优先级队列**处理：

```javascript
function resolveHiddenConflicts(triggeredHiddens) {
  if (triggeredHiddens.length === 0) return null;
  if (triggeredHiddens.length === 1) return triggeredHiddens[0];

  // 按稀有度排序（越稀有优先级越高）
  triggeredHiddens.sort((a, b) => a.rarity - b.rarity);

  // 返回最稀有的那个
  return triggeredHiddens[0];
  /*
    例如同时触发了 NPC (5%) 和 DRUNK (0.8%)
    → 返回 DRUNK（更稀有）
  */
}
```

**优先级规则总结**:

1. **稀有度优先**: 稀有度数值越小，优先级越高
2. **互斥原则**: 一个测试只会返回**一个**隐藏款（最稀有的那个）
3. **降级机制**: 如果最高优先级隐藏款概率未命中，尝试次优先级
4. **日志记录**: 记录所有满足条件的隐藏款，用于后续数据分析

### 4.6 隐藏款覆盖标准结果的流程

```
正常测试完成
     │
     ▼
calculateDimensionScores() → 得到维度得分
     │
     ▼
determinePersonalityType() → 得到标准类型（如 "ESFP"）
     │
     ▼
checkHiddenType() → 检测隐藏款
     │
     ├── null (未触发) ──→ 返回标准结果 "ESFP"
     │
     └── "DRUNK" (触发) ──→ 返回隐藏结果
                           │
                           ├── type: "DRUNK" (覆盖原始类型)
                           ├── originalType: "ESFP" (保存备份)
                           ├── isHidden: true
                           └── specialContent: { ... }
```

**重要提示**: 隐藏款应**完全替代**标准结果显示给用户，而非叠加显示。这能增强惊喜感和独特性。但后台应保留用户的真实MBTI类型，用于匿名统计和研究。

---

## 5. 伪代码实现

### 5.1 核心算法主入口

```javascript
/**
 * MBTI/SBTI 人格测试核心算法
 * @param answers - 用户回答数组 [{questionId: number, value: number}]
 * @param questions - 题库数组
 * @param mode - 测试模式: 'quick' | 'full'
 * @returns TestResult - 包含类型、得分、描述等完整结果
 */
async function getTestResult(answers, questions, mode = 'full') {
  // ========== 参数校验 ==========
  validateInputs(answers, questions, mode);

  // ========== 步骤1: 根据模式筛选题目 ==========
  let activeQuestions;
  if (mode === 'quick') {
    activeQuestions = filterQuickQuestions(questions);  // 提取12题
  } else {
    activeQuestions = questions;  // 使用全部题目
  }

  // ========== 步骤2: 计算维度得分 ==========
  const scores = calculateDimensionScores(answers, activeQuestions);

  // ========== 步骤3: 判定人格类型 ==========
  const personalityType = determinePersonalityType(scores, mode);

  // ========== 步骤4: 检测隐藏款（仅完整模式） ==========
  let finalResult;
  if (mode === 'full') {
    const hiddenType = checkHiddenType(scores, answers, questions);

    if (hiddenType) {
      finalResult = buildHiddenResult(hiddenType, personalityType, scores);
    } else {
      finalResult = buildStandardResult(personalityType, scores, mode);
    }
  } else {
    finalResult = buildStandardResult(personalityType, scores, mode);
  }

  // ========== 步骤5: 异步加载详情（可选） ==========
  finalResult.description = await loadTypeDescription(finalResult.type);
  finalResult.careerSuggestions = await loadCareerSuggestions(finalResult.type);

  // ========== 步骤6: 记录测试日志 ==========
  await logTestResult(finalResult);

  return finalResult;
}
```

### 5.2 维度得分计算函数

```javascript
/**
 * 计算八个极的原始得分
 * @param {Array} answers - 用户回答
 * @param {Array} questions - 题目配置
 * @returns {Object} 八极得分对象 {E, I, S, N, T, F, J, P}
 */
function calculateDimensionScores(answers, questions) {
  // 初始化得分对象
  const scores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };

  // 维度对到极的映射表
  const DIMENSION_MAP = {
    'EI': { positive: 'E', negative: 'I' },
    'SN': { positive: 'S', negative: 'N' },
    'TF': { positive: 'T', negative: 'F' },
    'JP': { positive: 'J', negative: 'P' }
  };

  // 遍历每个回答进行计分
  for (const answer of answers) {
    // 查找对应题目配置
    const question = questions.find(q => q.id === answer.questionId);
    if (!question) {
      console.warn(`未找到题目ID: ${answer.questionId}`);
      continue;
    }

    // 获取用户回答值（应在 -3 到 +3 之间，排除0）
    const value = answer.value;
    if (![-3, -2, -1, 1, 2, 3].includes(value)) {
      console.warn(`无效的回答值: ${value}, 题目ID: ${answer.questionId}`);
      continue;
    }

    // 获取该维度的两个极
    const { positive: posPole, negative: negPole } = DIMENSION_MAP[question.dimension];

    // 根据 direction 字段决定如何计分
    if (question.direction === 'positive') {
      // 正向题: 用户同意 → 正极得分；用户反对 → 负极得分
      if (value > 0) {
        scores[posPole] += value;
      } else {
        scores[negPole] += Math.abs(value);
      }
    } else {
      // 反向题（语义反转）: 用户同意 → 负极得分；用户反对 → 正极得分
      if (value > 0) {
        scores[negPole] += value;
      } else {
        scores[posPole] += Math.abs(value);
      }
    }
  }

  return scores;
}
```

### 5.3 类型判定函数

```javascript
/**
 * 根据维度得分判定人格类型
 * @param {Object} scores - 八极得分
 * @param {string} mode - 测试模式
 * @returns {string} 人格类型代码（如 "INTJ" 或 "EN"）
 */
function determinePersonalityType(scores, mode = 'full') {
  let type = '';

  // 定义维度对及其正极（用于平分时默认选择）
  const DIMENSION_PAIRS = [
    { pos: 'E', neg: 'I' },
    { pos: 'S', neg: 'N' },
    { pos: 'T', neg: 'F' },
    { pos: 'J', neg: 'P' }
  ];

  // 根据模式决定处理多少个维度
  const dimensionsToProcess = mode === 'quick' ? 2 : 4;

  for (let i = 0; i < dimensionsToProcess; i++) {
    const { pos, neg } = DIMENSION_PAIRS[i];
    const posScore = scores[pos];
    const negScore = scores[neg];

    // 核心判定逻辑: 比较得分，平分时默认取正极
    if (posScore >= negScore) {
      type += pos;
    } else {
      type += neg;
    }
  }

  return type;
}
```

### 5.4 隐藏款检测函数

```javascript
/**
 * 检测是否触发隐藏款人格
 * @param {Object} scores - 维度得分
 * @param {Array} answers - 用户完整回答
 * @param {Array} questions - 完整题库（包含隐藏题）
 * @returns {Object|null} 隐藏款配置对象，未触发则返回null
 */
function checkHiddenType(scores, answers, questions) {
  // ========== 前置检查 ==========
  // 1. 回答数量不足直接跳过
  if (answers.length < 40) return null;

  // 2. 一致性检验（防乱答刷隐藏款）
  const { isConsistent } = checkResponseConsistency(answers, questions);
  if (!isConsistent) return null;

  // ========== 加载隐藏款配置 ==========
  // 实际项目中从数据库或配置文件读取
  const hiddenConfigs = HIDDEN_PERSONALITY_CONFIGS;

  // ========== 收集所有触发的隐藏款 ==========
  const triggeredHiddens = [];

  for (const config of hiddenConfigs) {
    if (evaluateHiddenConditions(config, scores, answers)) {
      triggeredHiddens.push(config);
    }
  }

  // ========== 解决冲突并返回结果 ==========
  if (triggeredHiddens.length === 0) {
    return null;  // 未触发任何隐藏款
  }

  // 按稀有度排序，返回最稀有的
  triggeredHiddens.sort((a, b) => a.rarity - b.rarity);
  return triggeredHiddens[0];
}

/**
 * 评估单个隐藏款的触发条件
 */
function evaluateHiddenConditions(config, scores, answers) {
  // 检查1: 前置条件 - 最小答题数
  if (answers.length < config.prerequisites.minQuestionsAnswered) {
    return false;
  }

  // 检查2: 维度条件（满足任一即可）
  const dimConditionMet = config.dimensionConditions.some(condition => {
    switch (condition.type) {
      case 'extreme': {
        // 是否有任何维度达到极值
        const hasExtreme = Object.values(scores).some(
          score => Math.abs(score) >= (condition.threshold || 25)
        );
        return hasExtreme;
      }

      case 'balanced': {
        // 是否所有维度都在中间区域（接近NPC型）
        const allBalanced = Object.values(scores).every(
          score => Math.abs(score) <= (condition.threshold || 10)
        );
        return allBalanced;
      }

      case 'pattern': {
        // 是否符合特定模式（如高E + 高P）
        return matchesPattern(condition.pattern, scores);
      }

      default:
        return false;
    }
  });

  if (!dimConditionMet) return false;

  // 检查3: 隐藏题条件
  const { questionIds, requiredAnswers } = config.hiddenQuestionRequirements;
  const hiddenQuestionMet = questionIds.every((qId, index) => {
    const answer = answers.find(a => a.questionId === qId);
    return answer && answer.value === requiredAnswers[index];
  });

  if (!hiddenQuestionMet) return false;

  // 检查4: 概率控制（可选）
  if (config.triggerProbability < 1.0) {
    const randomValue = Math.random();  // 0~1之间的随机数
    if (randomValue > config.triggerProbability) {
      return false;  // 概率未命中，本次不触发
    }
  }

  // 所有条件满足！
  return true;
}
```

### 5.5 辅助工具函数

```javascript
/**
 * 过滤快速测试题目（从完整题库中精选12题）
 */
function filterQuickQuestions(allQuestions) {
  // 快速测试只需要 E/I 和 S/N 两个维度
  const targetDimensions = ['EI', 'SN'];

  // 从每个维度中选取3道正向题和3道反向题
  const selected = [];

  for (const dim of targetDimensions) {
    const dimQuestions = allQuestions.filter(q => q.dimension === dim);
    const positiveQs = dimQuestions.filter(q => q.direction === 'positive');
    const negativeQs = dimQuestions.filter(q => q.direction === 'negative');

    // 优先选择区分度高的题目（可通过预测试数据排序）
    selected.push(
      ...positiveQs.slice(0, 3),   // 取前3道正向题
      ...negativeQs.slice(0, 3)    // 取前3道反向题
    );
  }

  // 打乱顺序（避免用户看出规律）
  return shuffleArray(selected);
}

/**
 * 计算维度倾向百分比
 */
function calculateDimensionPercentages(scores) {
  const pairs = [
    ['E', 'I'], ['S', 'N'], ['T', 'F'], ['J', 'P']
  ];

  const percentages = {};

  for (const [pos, neg] of pairs) {
    const posAbs = Math.abs(scores[pos]);
    const negAbs = Math.abs(scores[neg]);
    const total = posAbs + negAbs;

    if (total === 0) {
      // 完全平分，各占50%
      percentages[pos] = 50;
      percentages[neg] = 50;
    } else {
      percentages[pos] = Math.round((posAbs / total) * 100);
      percentages[neg] = 100 - percentages[pos];
    }
  }

  return percentages;
}

/**
 * 分析倾向清晰度
 */
function analyzeClarity(scores) {
  const clarity = {};
  const pairs = [['E','I'], ['S','N'], ['T','F'], ['J','P']];

  for (const [pos, neg] of pairs) {
    const diff = Math.abs(scores[pos] - scores[neg]);
    const total = Math.abs(scores[pos]) + Math.abs(scores[neg]);

    if (total === 0 || diff === 0) {
      clarity[`${pos}${neg}`] = 'weak';      // 弱倾向
    } else if (diff / total > 0.5) {
      clarity[`${pos}${neg}`] = 'strong';     // 强倾向
    } else {
      clarity[`${pos}${neg}`] = 'moderate';   // 中等倾向
    }
  }

  return clarity;
}

/**
 * 数组随机打乱（Fisher-Yates洗牌算法）
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 输入参数校验
 */
function validateInputs(answers, questions, mode) {
  if (!Array.isArray(answers) || answers.length === 0) {
    throw new Error('回答数据不能为空');
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('题库数据不能为空');
  }

  if (!['quick', 'full'].includes(mode)) {
    throw new Error('无效的测试模式，必须是 "quick" 或 "full"');
  }

  const expectedCount = mode === 'quick' ? 12 : (questions.length >= 48 ? 48 : questions.length);
  if (answers.length < expectedCount * 0.8) {  // 允许80%完成度
    console.warn(`警告: 回答数量(${answers.length})低于预期(${expectedCount})`);
  }
}
```

### 5.6 完整调用示例

```javascript
// ========== 示例：执行一次完整测试 ==========

async function runExample() {
  // 1. 加载题库（实际项目中从API或本地JSON加载）
  const questions = await loadQuestionsFromDatabase();

  // 2. 模拟用户回答（实际来自前端表单提交）
  const mockAnswers = [
    { questionId: 1, value: 2 },   // 同意
    { questionId: 2, value: -1 },  // 有点不同意
    { questionId: 3, value: 3 },   // 非常同意
    { questionId: 4, value: -2 },  // 不同意
    // ... 更多回答（共48题）
  ];

  try {
    // 3. 执行测试算法
    const result = await getTestResult(mockAnswers, questions, 'full');

    // 4. 输出结果
    console.log('===== 测试结果 =====');
    console.log(`人格类型: ${result.type}`);
    console.log(`是否隐藏款: ${result.isHidden ? '✨ 是 (' + result.hiddenName + ')' : '否'}`);
    console.log('\n维度得分:');
    console.log(`  外向(E): ${result.scores.E} vs 内向(I): ${result.scores.I}`);
    console.log(`  感觉(S): ${result.scores.S} vs 直觉(N): ${result.scores.N}`);
    console.log(`  思维(T): ${result.scores.T} vs 情感(F): ${result.scores.F}`);
    console.log(`  判断(J): ${result.scores.J} vs 感知(P): ${result.scores.P}`);

    console.log('\n百分比分布:');
    console.log(`  ${result.percentages.E}% E — ${result.percentages.I}% I`);
    console.log(`  ${result.percentages.S}% S — ${result.percentages.N}% N`);
    console.log(`  ${result.percentages.T}% T — ${result.percentages.F}% F`);
    console.log(`  ${result.percentages.J}% J — ${result.percentages.P}% P`);

    console.log('\n倾向清晰度:', result.clarity);
    console.log('\n描述:\n', result.description);

  } catch (error) {
    console.error('测试执行失败:', error.message);
  }
}

// 执行示例
runExample();
```

**预期输出**:
```
===== 测试结果 =====
人格类型: INTJ
是否隐藏款: 否

维度得分:
  外向(E): 3 vs 内向(I): 18
  感觉(S): 5 vs 直觉(N): 16
  思维(T): 20 vs 情感(F): 2
  判断(J): 15 vs 感知(P): 6

百分比分布:
  14% E — 86% I
  24% S — 76% N
  91% T — 9% F
  71% J — 29% P

倾向清晰度: { EI: "strong", SN: "strong", TF: "very strong", JP: "moderate" }

描述:
 您是 INTJ - 建筑师型人格...
 （详细描述内容从数据库异步加载）
```

---

## 6. 参考资源与链接

### 6.1 开源项目参考

| 项目名称 | 语言 | 链接 | 特点 |
|----------|------|------|------|
| **mbti-test** | Python | [GitHub - luhuadong/mbti-test](https://github.com/luhuadong/mbti-test) | CLI工具，支持28/40/93题多版本，中英双语 |
| **ACGTI** | JavaScript | HelloGitHub 第121期推荐 | 二次元角色版MBTI，39题+110位动漫角色 |
| **Vue3+Canvas教师版MBTI** | TypeScript/Vue3 | CSDN博客 | 五维模型扩展，Canvas海报生成，彩蛋机制 |
| **MBTI小程序** | 微信小程序 | CSDN技术文章 | 云开发架构，30-40题轻量版实现 |

### 6.2 技术文档与教程

| 资源 | 链接 | 内容要点 |
|------|------|----------|
| **MBTI测试背后的原理（含免费API）** | CSDN - 2401_84664541 | API接口介绍，理论基础讲解 |
| **从零开发MBTI小程序** | CSDN - PYY0808 | 完整技术架构设计，前后端实现 |
| **Python MBTI练习项目** | 人人都懂物联网 | Python项目实战，JSON题库管理 |
| **李克特量表详解** | 百度百科 | 评分加总式量表的理论基础 |
| **教师版MBTI五维模型** | CSDN - qq_35432459 | 五维扩展模型，距离匹配算法 |

### 6.3 学术与研究资源

| 资源 | 说明 |
|------|------|
| **MBTI官方手册** | The Myers-Briggs Type Indicator® Manual |
| **Cronbach's α系数** | 心理测量学信度检验标准方法 |
| **荣格心理类型学** | Carl Jung - Psychological Types (1921) |
| **中国MBTI常模研究** | 国内学者针对中国样本的修订版本 |

### 6.4 在线测试平台（竞品参考）

| 平台 | 题量 | 特点 |
|------|------|------|
| **16Personalities** | 国际通用 | 全球最受欢迎，多语言支持 |
| **探心MBTI** | 30-40题 | 微信小程序，界面简洁无广告 |
| **网果MBTI** | 48/93题 | 荣格八维精细化计分，重测一致性92% |
| **奥思MBTI** | 93题 | 中文S-N语义修正，解决类型摇摆 |
| **CSM BTI** | 48题 | 极简版折中方案，效率与信度平衡 |
| **问卷星MBTI** | 48题 | 经典题库，学术研究常用 |

### 6.5 关键搜索词（供进一步调研）

- `MBTI scoring algorithm Likert scale`
- `MBTI forced choice vs rating scale`
- `MBTI item response theory IRT`
- `MBTI hidden easter egg personality trigger`
- `SBTI campus version algorithm`
- `MBTI open source implementation GitHub`
- `李克特6级量表 心理学 计分`
- `MBTI 正向题 反向题 设计`
- `人格测试 彩蛋 隐藏结果 触发机制`
- `MBTI reliability Cronbach alpha`

---

## 附录A: 16种人格类型速查表

| 类型 | 名称 | 核心特征 | 占比(约) |
|------|------|----------|----------|
| **ISTJ** | 检查员 | 务实、有序、负责 | 13% |
| **ISF** | 保护者 | 温和、忠诚、利他 | 13% |
| **INFJ** | 提倡者 | 理想、深刻、洞察 | 1.5% |
| **INTJ** | 建筑师 | 战略、独立、创新 | 2% |
| **ISTP** | 工匠 | 灵活、冷静、实用 | 6% |
| **ISFP** | 艺术家 | 温和、敏感、艺术 | 5% |
| **INFP** | 调停者 | 理想、和谐、创造 | 4% |
| **INTP** | 思想家 | 逻辑、分析、好奇 | 3% |
| **ESTP** | 企业家 | 行动、适应、冒险 | 4% |
| **ESFP** | 表演者 | 热情、自发、乐观 | 7% |
| **ENFP** | 竞选者 | 热情、创意、社交 | 7% |
| **ENTP** | 辩论机 | 聪明、好奇、挑战 | 3% |
| **ESTJ** | 总经理 | 组织、效率、领导 | 9% |
| **ESFJ** | 执政官 | 热心、合作、传统 | 12% |
| **ENFJ** | 主人公 | 魅力、鼓舞、领导 | 3% |
| **ENTJ** | 指挥官 | 果断、战略、领导 | 3% |

*注：占比数据基于西方样本，中国人群体的实际分布可能有所不同*

---

## 附录B: 术语表

| 术语 | 英文 | 解释 |
|------|------|------|
| **Likert量表** | Likert Scale | 等级评分式心理测量量表 |
| **强制选择法** | Force Choice | 二选一的问答方式 |
| **方向/极性** | Direction/Polarity | 题目与维度的对应关系（正向/反向） |
| **Cronbach's α** | Cronbach's Alpha | 内部一致性信度系数 |
| **重测一致性** | Test-Retest Reliability | 不同时间测试结果的一致程度 |
| **社会称许性** | Social Desirability | 受试者选择社会认可答案的倾向 |
| **八极** | Eight Poles | MBTI的8个基本维度端点 |
| **四维** | Four Dimensions | MBTI的4组对立维度 |
| **隐藏款** | Hidden/Easter Egg | 特殊条件下触发的稀有结果 |
| **彩蛋** | Easter Egg | 软件中的惊喜功能或内容 |

---

## 附录C: 版本更新记录

| 版本 | 日期 | 作者 | 更新内容 |
|------|------|------|----------|
| v1.0 | 2026-06-10 | NF-BTI Team | 初始版本，完整算法设计文档 |

---

> **文档结束**
>
> 本文档为 nfBTI 项目的核心技术规范，所有算法实现应严格遵循本文档规定。如有疑问或建议改进，请提交 Issue 或 Pull Request。
