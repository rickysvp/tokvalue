/**
 * Admin authentication — JWT sign/verify + DB 登录限流 + 登录审计日志。
 * Only import from API routes / server components.
 *
 * 安全策略：ADMIN_JWT_SECRET 未配置时拒绝签发与校验（生产环境必须配置）。
 * 不再有硬编码回退密钥，避免攻击者用公开字符串伪造 admin JWT。
 */

import { SignJWT, jwtVerify } from 'jose'
import crypto from 'crypto'
import { checkIpRateLimit, ipBucketKey } from './rate-limit'
import { recordEventFromRequest, type EventType } from './analytics'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
const ADMIN_JWT_SECRET_RAW = process.env.ADMIN_JWT_SECRET || ''

if (!ADMIN_PASSWORD && process.env.NODE_ENV === 'production') {
  console.warn('[admin-auth] ADMIN_PASSWORD is not set. Admin login is disabled.')
}
if (!ADMIN_JWT_SECRET_RAW && process.env.NODE_ENV === 'production') {
  console.warn('[admin-auth] ADMIN_JWT_SECRET is not set. Admin token sign/verify will fail.')
}

// 至少 32 字节
function getJwtSecret(): Uint8Array {
  if (!ADMIN_JWT_SECRET_RAW || ADMIN_JWT_SECRET_RAW.length < 32) {
    throw new Error('ADMIN_JWT_SECRET must be set and at least 32 characters')
  }
  return new TextEncoder().encode(ADMIN_JWT_SECRET_RAW)
}

const TOKEN_MAX_AGE = '24h'

// ── 登录限流（DB 共享计数，serverless 多实例下生效）──
// 旧实现为进程内存 Map，在 Vercel 等 serverless 多实例环境下各实例独立计数，
// 防爆破彻底失效。现复用 lib/rate-limit.ts 的 checkIpRateLimit：
// - bucket key = `admin-login:{ipHash}`（IP 经 HMAC 哈希，不存明文）
// - 原子计数（INSERT ... ON CONFLICT DO UPDATE），按小时窗口截断
// - 该模块自身 fail-open：DB 故障时放行（console.warn），不牺牲登录可用性
const LOGIN_RATE_LIMIT = { limit: 5, windowHours: 1 }

export function checkLoginRateLimit(request: Request): Promise<boolean> {
  return checkIpRateLimit(ipBucketKey('admin-login', request), LOGIN_RATE_LIMIT)
}

// ── 登录审计日志 ──
// 写入 analytics_events（event_type='admin_login_attempt'，metadata.success 标记成败），
// 复用 recordEventFromRequest 自动提取 ip_hash / user_agent，created_at 由 DB 默认值填充。
// 不选用 admin_audit_log：该表面向积分操作审计（target_email/credits 必填、无 ip_hash 列），
// 与登录场景不匹配。
// 安全约束：绝不记录用户提交的密码（含错误密码），metadata 只含 success 布尔值。
// 注意：lib/analytics.ts 的 EventType 为封闭联合类型且不可修改，
// 此处经 string 中转断言扩展事件名（event_type 为 TEXT 列，无 DB 层约束，运行时安全）。
const LOGIN_EVENT_TYPE: string = 'admin_login_attempt'

export async function recordLoginAttempt(request: Request, success: boolean): Promise<void> {
  try {
    await recordEventFromRequest(request, {
      event_type: LOGIN_EVENT_TYPE as EventType,
      path: '/api/tiktokmaster/auth',
      metadata: { success },
    })
  } catch (err) {
    // 审计写入失败不阻断登录流程，仅告警
    console.warn('[admin-auth] login audit log failed (non-blocking):',
      err instanceof Error ? err.message : String(err))
  }
}

// ── Admin JWT ──

export interface AdminPayload {
  role: 'admin'
}

export async function signAdminToken(): Promise<string> {
  const secret = getJwtSecret()
  return new SignJWT({ role: 'admin' as const })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_MAX_AGE)
    .setJti(crypto.randomUUID())
    .sign(secret)
}

export async function verifyAdminToken(token: string): Promise<AdminPayload | null> {
  try {
    const secret = getJwtSecret()
    const { payload } = await jwtVerify(token, secret)
    if (payload.role === 'admin') {
      return { role: 'admin' }
    }
    return null
  } catch {
    return null
  }
}

export function validatePassword(password: string): boolean {
  if (!ADMIN_PASSWORD) return false
  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(password)
  const b = Buffer.from(ADMIN_PASSWORD)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
