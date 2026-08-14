import { NextRequest, NextResponse } from 'next/server'
import {
  validatePassword,
  signAdminToken,
  checkLoginRateLimit,
  recordLoginAttempt,
  ADMIN_TOKEN_COOKIE,
} from '@/lib/admin-auth'
import { rateLimitResponse } from '@/lib/rate-limit'

// httpOnly cookie 参数（审计 M-15：token 不再暴露给前端 JS，XSS 无法窃取 24h 凭证）
// - Secure 仅生产启用：本地 http 开发下 Secure cookie 会被浏览器丢弃
// - Path 限定 /api/tiktokmaster：cookie 只随 admin API 请求发送，缩小暴露面
// - Max-Age 86400 = 24h，与 JWT 有效期一致
function adminTokenCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/tiktokmaster',
    maxAge,
  }
}

export async function POST(req: NextRequest) {
  // DB 限流（跨实例共享计数）：5 次/小时/IP，超限统一 429，不泄漏其他信息
  const allowed = await checkLoginRateLimit(req)
  if (!allowed) {
    // 超限请求不写审计日志：本小时窗口内的前几次尝试已留痕，
    // 且避免攻击者借超限请求无限刷写 analytics_events；
    // 限流表自身的计数记录（ip_rate_limits 中 admin-login:{ipHash}）即爆破痕迹。
    return rateLimitResponse('Too many login attempts. Try again later.')
  }

  try {
    const body = await req.json().catch(() => ({}))
    const password = String(body.password || '')

    if (!password) {
      await recordLoginAttempt(req, false)
      return NextResponse.json({ error: 'Password is required' }, { status: 400 })
    }

    if (!validatePassword(password)) {
      await recordLoginAttempt(req, false)
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }

    // 密码校验通过即记成功审计（只记成败与 ip_hash，绝不记录密码本身）
    await recordLoginAttempt(req, true)

    const token = await signAdminToken()
    // token 只经 Set-Cookie 下发（httpOnly），不再写入响应体，前端 JS 无需也无法读取
    const res = NextResponse.json({ ok: true })
    res.cookies.set(ADMIN_TOKEN_COOKIE, token, adminTokenCookieOptions(86400))
    return res
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    // 如果是 JWT secret 未配置，返回明确的配置错误提示
    if (msg.includes('ADMIN_JWT_SECRET')) {
      console.error('[admin-auth] config error:', msg)
      return NextResponse.json(
        { error: 'Server is missing ADMIN_JWT_SECRET configuration. Please contact the administrator.' },
        { status: 500 }
      )
    }
    console.error('[admin-auth] login error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// 登出：清除 httpOnly cookie。
// httpOnly cookie 前端 JS 无法清除（document.cookie 不可见），必须由后端下发过期指令。
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_TOKEN_COOKIE, '', adminTokenCookieOptions(0))
  return res
}
