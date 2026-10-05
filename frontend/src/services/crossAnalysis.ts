// 交叉分析服务 —— 通过后端代理调用 DeepSeek（API Key 仅在服务端）
// 将 NFTI + 霍兰德结果提交生成个性化分析，支持流式输出
import { postWithTimeout } from './channelDb'

const PROXY_BASE = '/api'

// ─── 输入数据类型 ───

export interface NftiForCross {
  typeCode: string
  typeName: string
  fourLetter?: string | null
  scores: Record<string, number>
  mode: string
  description: string
  detail: string
}

export interface HollandForCross {
  code: string // 三位码如 "EAS"
  primary: string
  secondary: string
  tertiary: string
  scores: Record<string, number>
  roles: { dimension: string; name: string; emoji: string }[]
}

// ─── System Prompt ───

const SYSTEM_PROMPT = `基于用户的 NFTI 人格得分 和 霍兰德职业兴趣得分，生成交叉分析。
在回答中引用具体的分数对比来说明行为倾向，不要只说类型代号。

## NFTI 四维度（得分越高表示该倾向越强）

| 维度 | 左侧倾向 | 右侧倾向 |
|------|---------|---------|
| 社交电量 | O 外向充电（E分高→越聊越嗨） | R 内向省电（I分高→需要独处） |
| 信息偏好 | G 务实显微镜（S分高→关注细节） | V 幻想望远镜（N分高→关注可能性） |
| 决策风格 | L 理性计算器（T分高→靠逻辑） | E 感性温度计（F分高→靠感受） |
| 生活节奏 | S 结构化课表型（J分高→按计划） | F 随性自由型（P分高→跟感觉） |

## 霍兰德六维度（得分越高越符合该类型）

R=现实型🔧(动手/技术) I=研究型🔬(研究/分析)
A=艺术型🎨(创造/表达) S=社会型🤝(助人/合作)
E=企业型💼(领导/影响) C=常规型📋(秩序/规范)

## 南方中学真实社团列表（AI 只能从以下列表中推荐，不得编造）

舞蹈社、bbox社、动漫社、电视台新闻社、国际交流社、国学社、汉服社、话剧社、化学社、街舞社、篮球社、日光社、生物社、手工社、舞蹈社、信息社、足球社、天籁之音（流音社/万籁有声社）、文学社、吐槽社、美食社、商帮

## 输出格式

必须输出四段，每段以 emoji+粗体标题开头：

🧩 **核心矛盾/协同**
用 1-2 句话概括 NFTI 强维度 vs 霍兰德强维度的关系。必须引用具体分数对比，比如「你 NFTI 的 O(8) 和 E(7) 都很高，是个外向又感性的人，但霍兰德最高的却是 C(9) 常规型——反差很大」。

🏫 **校园行为画像**
写 2-3 个具体的校园场景，覆盖食堂/课堂/宿舍/社团中的一个。必须基于分数对比来推导行为，比如「因为你的 J(12)>P(6)，你会提前规划好去哪层楼吃饭；但同时你的 A(8) 又让你经常临时变卦」。不要编造不存在的场景。

🎯 **具体建议**
给出 2-3 条明确可执行的建议，每条包含：什么场景+为什么适合你+具体怎么做。例如「你可以尝试加入生物社竞赛组——你的 I(9) 适合做研究分析，而你的 E(7) 让你能带领小组完成实验报告」。

⚠️ **盲区**
写 1 条基于分数差距导致的潜在问题，以及一个可操作的改进方法。

## 硬性规则

- 必须引用具体数字（NFTI 维度和霍兰德分数）来说明行为倾向，每段至少引用 2 组对比
- 每条建议必须可执行（具体到场景和动作）
- 禁止使用空泛比喻（如「精密仪器」「外表低调」）
- 禁止用「你是XXX」开头的主观判断句式
- 语气：直接、校园化、像同学聊天
- 总字数 400-600 字`

// ─── 构建用户上下文 ───

function buildNftiContext(nfti: NftiForCross): string {
  const dims = [
    { key: 'O', label: '外向充电', mbtiKey: 'E', score: nfti.scores['E'] ?? 0 },
    { key: 'R', label: '内向省电', mbtiKey: 'I', score: nfti.scores['I'] ?? 0 },
    { key: 'G', label: '务实显微镜', mbtiKey: 'S', score: nfti.scores['S'] ?? 0 },
    { key: 'V', label: '幻想望远镜', mbtiKey: 'N', score: nfti.scores['N'] ?? 0 },
    { key: 'L', label: '理性计算器', mbtiKey: 'T', score: nfti.scores['T'] ?? 0 },
    { key: 'E', label: '感性温度计', mbtiKey: 'F', score: nfti.scores['F'] ?? 0 },
    { key: 'S', label: '结构化课表型', mbtiKey: 'J', score: nfti.scores['J'] ?? 0 },
    { key: 'F', label: '随性自由型', mbtiKey: 'P', score: nfti.scores['P'] ?? 0 },
  ]

  const dimLines = dims
    .map(d => {
      const opposite = dims.find(o => o.mbtiKey !== d.mbtiKey && ['E,I','I,E','S,N','N,S','T,F','F,T','J,P','P,J'].includes(d.mbtiKey + ',' + o.mbtiKey))
      return opposite ? `  - ${d.key}(${d.label}): ${d.score}  |  ${opposite.key}(${opposite.label}): ${opposite.score}` : `  - ${d.key}(${d.label}): ${d.score}`
    })
    .join('\n')

  return `### NFTI 人格结果

- **类型**: ${nfti.typeCode} · ${nfti.typeName}${nfti.fourLetter ? ` (对应 MBTI: ${nfti.fourLetter})` : ''}
- **测试模式**: ${nfti.mode === 'quick' ? '快速(12题)' : '完整(48题)'}
- **简介**: ${nfti.description}

**维度得分（同维度两个分数互相对比，高分侧为主导倾向）:**
${dimLines}`
}

function buildHollandContext(holland: HollandForCross): string {
  const roleLines = holland.roles
    .map(r => `  - ${r.emoji} ${r.dimension}·${r.name}`)
    .join('\n')

  const scoreLines = (['R', 'I', 'A', 'S', 'E', 'C'] as const)
    .map(dim => `  - ${dim}: ${holland.scores[dim] ?? 0}`)
    .join('\n')

  return `### 霍兰德职业兴趣结果

- **三码**: ${holland.code}（首位=${holland.primary} 次位=${holland.secondary} 第三=${holland.tertiary}）

**角色诠释（按得分排序取前三）:**
${roleLines}

**六维得分:**
${scoreLines}`
}

function buildUserMessage(nfti: NftiForCross, holland: HollandForCross): string {
  return `请为这位南方中学的同学生成个性化交叉分析。

${buildNftiContext(nfti)}

${buildHollandContext(holland)}

请根据以上分数组合，生成四部分分析。`
}

// ─── 通过后端代理调用 DeepSeek ───

export interface CrossAnalysisCallbacks {
  onChunk: (text: string) => void
  onComplete: (fullText: string) => void
  onError: (error: Error) => void
}

/**
 * 流式调用 DeepSeek 生成交叉分析（通过后端代理，API Key 不暴露到浏览器）
 */
export async function getCrossAnalysisStream(
  nfti: NftiForCross,
  holland: HollandForCross,
  callbacks: CrossAnalysisCallbacks
): Promise<void> {
  const { onChunk, onComplete, onError } = callbacks

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserMessage(nfti, holland) },
  ]

  // 从 localStorage 读取 session（后端要求登录态验证）
  let session: string | undefined
  try {
    const raw = localStorage.getItem('nfti_channel_session')
    if (raw) { const d = JSON.parse(raw); if (d.sessionId) session = d.sessionId }
  } catch {}

  // 流式超时保护：无数据推进超过 45s 则中止
  const controller = new AbortController()
  let lastDataAt = Date.now()
  const idleTimer = setInterval(() => {
    if (Date.now() - lastDataAt > 45000) controller.abort()
  }, 5000)
  const maxTimer = setTimeout(() => controller.abort(), 120000)

  try {
    const response = await postWithTimeout(PROXY_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'ai-proxy',
        session,
        params: {
          messages,
          stream: true,
          model: 'deepseek-v4-flash',
          temperature: 0.7,
          max_tokens: 2048,
          thinking: { type: 'disabled' },
        },
      }),
      signal: controller.signal,
    }, 120000)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`)
    }

    if (!response.body) {
      throw new Error('响应体为空')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let fullText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (!trimmed.startsWith('data: ')) continue

        try {
          const jsonStr = trimmed.slice(6)
          const json = JSON.parse(jsonStr)
          const delta = json.choices?.[0]?.delta?.content
          if (delta) {
            fullText += delta
            lastDataAt = Date.now()
            onChunk(fullText)
          }
        } catch {
          // 忽略解析失败的行
        }
      }
    }

    clearInterval(idleTimer)
    clearTimeout(maxTimer)
    onComplete(fullText)
  } catch (err) {
    clearInterval(idleTimer)
    clearTimeout(maxTimer)
    const error = err instanceof Error ? err : new Error(String(err))
    onError(error)
  }
}


