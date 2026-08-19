import { NextRequest, NextResponse } from 'next/server'
import {
  recordEventFromRequest,
  shouldSkipEvent,
  normalizeHostname,
  normalizeReferrer,
  type EventType,
} from '@/lib/analytics'
import { checkIpRateLimit, ipBucketKey, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// TikTok username 格式：1-24 位字母/数字/点/下划线（校验前先去 @ 前缀）
const USERNAME_RE = /^[a-z0-9._]{1,24}$/i

// metadata 序列化后的最大长度（超过则丢弃客户端 metadata，防垃圾数据撑爆 JSONB）
const MAX_METADATA_CHARS = 2000

/**
 * event_type 白名单：仅允许客户端 UI 埋点事件（现有调用方 PageViewTracker / EvaluatePage）。
 * purchase / evaluate_start / evaluate_done / api_error 等业务事件由服务端路由
 * （stripe webhook、evaluate、search 等）直接调用 recordEventFromRequest 写入，
 * 禁止公网客户端通过本端点伪造——否则可污染营收/评估/错误统计。
 */
const TRACK_EVENT_TYPES: readonly string[] = [
  'page_view',
  'search',
  'paywall_view',
  'paywall_click',
  'upgrade_click',
  // Commercial Growth PMF 事件（区分新定位与旧估值定位的转化差异）
  'commercial_snapshot_ready',
  // B3 Teaser 转化漏斗事件
  'teaser_viewed',
  'paywall_viewed',
  'unlock_completed',
  'deal_toolkit_unlock_clicked',
  // B7 Spec §15 埋点对齐（WS-C）：客户端事件
  // （cache_hit / second_review_started 为服务端事件，由 evaluate route 直接
  //  调 recordEventFromRequest 写入，不进客户端白名单）
  'email_verified',
  'tiktok_username_submitted',
  'dashboard_viewed',
  'growth_plan_viewed',
  'growth_task_viewed',
  'growth_task_completed',
  'report_viewed',
  'report_downloaded',
  'report_shared',
  'pricing_viewed',
]

/**
 * 客户端埋点接收端点。
 * 所有 tracker（PageViewTracker、trackEvent 等）统一发到此路由，
 * 由 lib/analytics 的 recordEventFromRequest 统一写入。
 *
 * 优化：
 * - IP 限流（60 次/小时），防 analytics 刷数据
 * - event_type 白名单，禁止伪造服务端业务事件
 * - 过滤 bot/crawler，避免污染 UV/PV 数据
 * - 归一化 Vercel preview hostname 到生产域名
 * - username/email/metadata 字段校验与截断，防垃圾数据
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // IP 限流：防 analytics 刷数据（60 次/小时；限流服务异常时 fail-open 放行）
    const ipAllowed = await checkIpRateLimit(ipBucketKey('track', req), { limit: 60, windowHours: 1 })
    if (!ipAllowed) {
      return rateLimitResponse('Too many tracking requests')
    }

    // event_type 白名单：不在集合内直接拒绝（含缺失的情况，不再落库 'unknown' 垃圾数据）
    const eventType = String(body.event_type || '')
    if (!TRACK_EVENT_TYPES.includes(eventType)) {
      return NextResponse.json({ ok: false, error: 'invalid_event_type' }, { status: 400 })
    }

    // Bot filtering: skip non-human traffic for page_view events
    const ua = req.headers.get('user-agent') || ''
    if (eventType === 'page_view' && shouldSkipEvent(ua)) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    // username 校验（可选字段）：限长 24 + TikTok 用户名格式，防垃圾数据
    const rawUsername = body.username
    let username: string | undefined
    if (rawUsername !== undefined && rawUsername !== null && String(rawUsername).trim() !== '') {
      const normalized = String(rawUsername).trim().replace(/^@/, '')
      if (!USERNAME_RE.test(normalized)) {
        return NextResponse.json({ ok: false, error: 'invalid_username' }, { status: 400 })
      }
      username = normalized
    }

    // email 校验（可选字段）：基本格式（含 @）即可，防垃圾数据
    const rawEmail = body.email
    let email: string | undefined
    if (rawEmail !== undefined && rawEmail !== null && String(rawEmail).trim() !== '') {
      email = String(rawEmail).trim()
      if (!email.includes('@')) {
        return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 })
      }
    }

    // metadata：仅接受普通对象（拒绝数组/字符串等），与 hostname 合并后
    // 序列化超过 2000 字符则丢弃客户端 metadata（仅保留 hostname），防止超大 payload 入库
    const rawMeta = body.metadata
    const clientMeta = (rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta))
      ? rawMeta as Record<string, unknown>
      : {}
    const hostname = normalizeHostname(req.headers.get('host') || '')
    let metadata: Record<string, unknown> = { ...clientMeta, hostname }
    if (JSON.stringify(metadata).length > MAX_METADATA_CHARS) {
      metadata = { hostname }
    }

    // Extract session_id (client sid, used for UV dedup)
    const sessionId = body.session_id || null

    // Normalize referrer — map Vercel preview URLs to production domain
    const rawReferrer = body.referrer || ''
    const normalizedReferrer = normalizeReferrer(rawReferrer)

    await recordEventFromRequest(req, {
      // 已通过白名单校验（'upgrade_click' 为客户端事件，未收录进 EventType 联合类型，DB 列为 TEXT 无约束）
      event_type: eventType as EventType,
      path: body.path || '/',
      username,
      email,
      metadata,
      session_id: sessionId,
      referrer: normalizedReferrer || undefined,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[track] recordEvent failed:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ ok: false, error: 'track_failed' }, { status: 500 })
  }
}
