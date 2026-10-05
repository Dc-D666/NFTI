/**
 * 访问计数工具
 * 使用 ruseo.cn Counter API
 * 文档: https://js.ruseo.cn/api-docs.php
 *
 * 注意：该 API 不支持 CORS，前端无法通过 fetch 读取响应。
 * 解决方案：
 * 1. 用 Image 像素追踪方式发送 increment（无 CORS 限制）
 * 2. 用 localStorage 缓存上次成功获取的值
 * 3. 每次 increment 时本地缓存 +1，作为近似显示值
 */

const API_KEY = import.meta.env.VITE_COUNTER_API_KEY
const BASE_URL = 'https://js.ruseo.cn/api/counter.php'

// 计数器 ID 映射
const COUNTER_IDS = {
  visits: '26cff43370ea5b0c12270ccef62887af',
  completes: '27f8c0f686d6623a865fc2bf78758584',
}

// 本地缓存键
const CACHE_KEY = 'nfti_counter_cache'

interface CounterCache {
  visits: number
  completes: number
  lastSync: string
}

function getCache(): CounterCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) return JSON.parse(raw) as CounterCache
  } catch { /* ignore */ }
  return { visits: 0, completes: 0, lastSync: '' }
}

function saveCache(cache: CounterCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch { /* ignore */ }
}

// 使用 Image 对象实现无 CORS 限制的计数（像素追踪）
function countViaImage(counterId: string, value = 1): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = `${BASE_URL}?action=increment&api_key=${encodeURIComponent(API_KEY)}&counter_id=${encodeURIComponent(counterId)}&value=${value}&_t=${Date.now()}`
  })
}

export const counter = {
  /** 增加并获取完成测试计数 */
  async hitComplete(): Promise<number> {
    const cache = getCache()
    cache.completes += 1
    cache.lastSync = new Date().toISOString()
    saveCache(cache)
    countViaImage(COUNTER_IDS.completes)
    return cache.completes
  },

  /** 增加并获取特定人格类型计数 */
  async hitType(typeCode: string): Promise<number> {
    const key = `nfti_type_${typeCode}`
    try {
      const raw = localStorage.getItem(key)
      const count = raw ? parseInt(raw, 10) + 1 : 1
      localStorage.setItem(key, String(count))
      return count
    } catch {
      return 0
    }
  },
}
