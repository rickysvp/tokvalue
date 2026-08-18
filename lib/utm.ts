/**
 * UTM 归因采集（客户端）。
 * 首次访问时从 URL query 解析 utm_* 参数，存 sessionStorage（标签页级，7 天 TTL），
 * 后续所有客户端埋点（page_view / upgrade_click / paywall_click 等）统一携带，
 * 使「渠道 → 访问 → 免费评估 → 付费」全链路可归因。
 *
 * 存 sessionStorage 而非 localStorage：utm 是"本次会话从哪来"的语义，
 * 跨标签页/跨会话复用会污染归因。
 */

export interface UtmParams {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
  /** 推荐码（?ref=CODE，推荐佣金追踪） */
  ref?: string
  /** 首访时间戳（TTL 判断用） */
  ts: number
}

const KEY = 'tokvalue_utm'
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

const UTM_KEYS: Array<keyof Omit<UtmParams, 'ts'>> = ['source', 'medium', 'campaign', 'content', 'term']

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

/** 从当前 URL 解析 utm_* 参数。 */
function parseFromUrl(): Partial<Omit<UtmParams, 'ts'>> {
  if (!isBrowser()) return {}
  const params = new URLSearchParams(window.location.search)
  const result: Partial<Omit<UtmParams, 'ts'>> = {}
  for (const key of UTM_KEYS) {
    const v = params.get(`utm_${key}`)
    if (v && v.trim() !== '') result[key] = v.trim().slice(0, 100)
  }
  // 推荐码：?ref=CODE（不截断到 100，码本身短；仍做上限保护）
  const ref = params.get('ref')
  if (ref && ref.trim() !== '') result.ref = ref.trim().toUpperCase().slice(0, 32)
  return result
}

/** 首次调用时：若 URL 有 utm 参数则采集写入 sessionStorage（覆盖旧值，不叠加）。 */
export function captureUtm(): void {
  if (!isBrowser()) return
  try {
    const parsed = parseFromUrl()
    if (Object.keys(parsed).length === 0) return
    const payload: UtmParams = { ...parsed, ts: Date.now() }
    sessionStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    // sessionStorage 不可用（隐私模式等）时静默忽略
  }
}

/** 读取当前会话的 utm 参数（已过期返回 null）。 */
export function getUtm(): Partial<Omit<UtmParams, 'ts'>> | null {
  if (!isBrowser()) return null
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UtmParams
    if (!parsed || Date.now() - parsed.ts > TTL_MS) {
      sessionStorage.removeItem(KEY)
      return null
    }
    const { ts, ...rest } = parsed
    void ts
    return Object.keys(rest).length > 0 ? rest : null
  } catch {
    return null
  }
}

/** 合并 utm 到 metadata（仅在有 utm 时添加，避免空对象污染）。 */
export function attachUtm<T extends Record<string, unknown>>(metadata?: T): T {
  const utm = getUtm()
  if (!utm) return (metadata || {}) as T
  return { ...(metadata || {}), utm } as unknown as T
}
