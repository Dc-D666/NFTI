// 插图加载工具：NFTI 人格图 + 职业图
// 统一封装 import.meta.glob 与命名规范化，供结果页 / 图鉴页复用
// （ResultView / HollandResultView 内的旧逻辑保留不动，避免回归）

// ─── NFTI 人格插图 ───
// 优先加载压缩版 JPG（assets 根目录，每张 ~100-760KB）；原图 NFTI/*.png 每张 1.5MB+，
// 图鉴页一次加载 16 张会严重拖慢。缺压缩版的码（如 OGES）回退原 PNG。
const rawNftiJpgMap: Record<string, string> = import.meta.glob('/src/assets/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const rawNftiPngMap: Record<string, string> = import.meta.glob('/src/assets/NFTI/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

// 压缩 JPG 按四维码索引（/src/assets/OVEF.jpg → OVEF）
const nftiJpgByCode: Record<string, string> = {}
for (const [key, value] of Object.entries(rawNftiJpgMap)) {
  const m = key.match(/\/([A-Z]{4})\.jpg$/)
  if (m && m[1]) nftiJpgByCode[m[1]] = value
}

// 原 PNG 按 illustration 路径索引（统一 key 格式：确保以 /src/assets/ 开头）
const nftiPngMap: Record<string, string> = {}
for (const [key, value] of Object.entries(rawNftiPngMap)) {
  const normalizedKey = key.startsWith('/src/assets/') ? key : `/src/assets/${key.split('/assets/').pop()}`
  nftiPngMap[normalizedKey] = value
}

/** 根据 personalities.ts 中存储的 illustration 路径（/src/assets/NFTI/xxx.png）取实际构建 URL */
export function getNftiIllustration(path: string | undefined): string | undefined {
  if (!path) return undefined
  // 优先压缩 JPG，缺码时回退原 PNG
  const code = path.match(/\/([A-Z]{4})\.png$/)
  if (code && code[1] && nftiJpgByCode[code[1]]) return nftiJpgByCode[code[1]]
  if (nftiPngMap[path]) return nftiPngMap[path]
  // 兼容不带 /src 前缀的格式
  const altPath = path.startsWith('/src/') ? path.slice(4) : `/src${path}`
  return nftiPngMap[altPath]
}

/**
 * 从 illustration 路径提取 NFTI 四维度代码（如 '/src/assets/NFTI/OVEF.png' → 'OVEF'）。
 * NFTI 代码体系（O/R · G/V · E/L · S/F）是产品自己的标识，区别于 MBTI 的 fourLetter（ESTJ 等）。
 * 无 illustration 时回退到人格 code（如隐藏人格 MEOW）。
 */
export function getNftiCode(path: string | undefined, fallbackCode: string): string {
  if (!path) return fallbackCode
  const m = path.match(/\/([A-Z]{4})\.png$/)
  if (m && m[1]) return m[1]
  return fallbackCode
}

// ─── 职业插图（/src/assets/Job/*.png，按职业 title 匹配文件名）───
const jobIllustrations: Record<string, string> = import.meta.glob('/src/assets/Job/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/**
 * 根据职业 title 取插图。
 * 命名规则：title.replace(/\//g, '-').replace(/\s+/g, '')，如
 * 「科技记者/科普作家」→ 科技记者-科普作家.png；「CTO / 技术总监」→ CTO-技术总监.png
 * 匹配不到时兜底 auto.png
 */
export function getJobIllustration(title: string): string | undefined {
  const normalized = title.replace(/\//g, '-').replace(/\s+/g, '')
  const key = Object.keys(jobIllustrations).find(k => k.includes(normalized))
  if (key) return jobIllustrations[key]
  const autoKey = Object.keys(jobIllustrations).find(k => k.includes('auto'))
  return autoKey ? jobIllustrations[autoKey] : undefined
}
