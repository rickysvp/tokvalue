import { NextRequest, NextResponse } from 'next/server'
import { getBalance } from '@/lib/credits-server'
import { checkIpRateLimit, ipBucketKey, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 邮箱状态查询：付费前分流用。
// - 新邮箱 → 前端直接走 Guest Checkout（无验证码）
// - 已有额度的邮箱 → 前端转验证码流程验证所有权（防重复付费 + 恢复登录）
// 仅返回布尔，不返回余额数字，最小化枚举信息泄漏。
export async function POST(req: NextRequest) {
  try {
    // IP 限流：防邮箱枚举探测
    if (!(await checkIpRateLimit(ipBucketKey('lookup', req), { limit: 20, windowHours: 1 }))) {
      return rateLimitResponse('Too many lookups. Please try again later.')
    }

    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').toLowerCase().trim()
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Valid email required', code: 'INVALID_EMAIL' }, { status: 400 })
    }

    const balance = await getBalance(email)
    return NextResponse.json({
      exists: !!balance,
      hasCredits: !!balance && balance.credits > 0,
    })
  } catch (err) {
    console.error('[lookup] error:', err)
    // fail-open：查询失败按新用户处理，不阻断付费
    return NextResponse.json({ exists: false, hasCredits: false })
  }
}
