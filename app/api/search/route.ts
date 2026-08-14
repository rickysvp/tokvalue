import { NextRequest, NextResponse } from 'next/server'
import { searchUsers } from '@/lib/tiktok'
import { getServerDict } from '@/lib/i18n/server'
import { recordEventFromRequest } from '@/lib/analytics'
import { checkIpRateLimit, ipBucketKey, rateLimitResponse } from '@/lib/rate-limit'
import { ApiErrorResponse } from '@/types'

export const dynamic = 'force-dynamic'

type ApiCode = ApiErrorResponse['code']

const CODE_TO_HTTP: Record<ApiCode, { status: number; message: string }> = {
  INVALID_USERNAME: { status: 400, message: getServerDict().api.search.INVALID_USERNAME },
  USER_NOT_FOUND: { status: 404, message: getServerDict().api.search.USER_NOT_FOUND },
  RATE_LIMIT: { status: 429, message: getServerDict().api.search.RATE_LIMIT },
  MISSING_API_KEY: { status: 503, message: getServerDict().api.search.MISSING_API_KEY },
  NETWORK_ERROR: { status: 502, message: getServerDict().api.search.NETWORK_ERROR },
  API_ERROR: { status: 500, message: getServerDict().api.search.API_ERROR },
  UNAUTHORIZED: { status: 401, message: getServerDict().api.search.UNAUTHORIZED },
  CONSUME_ERROR: { status: 500, message: getServerDict().api.errors.CONSUME_ERROR },
  BALANCE_ERROR: { status: 500, message: getServerDict().api.errors.BALANCE_ERROR },
}

export async function GET(req: NextRequest) {
  let keywords = ''
  try {
    const { searchParams } = new URL(req.url)
    keywords = searchParams.get('q') || searchParams.get('keywords') || ''
    const count = Math.max(1, Math.min(parseInt(searchParams.get('count') || '10', 10) || 10, 30))

    if (!keywords.trim()) {
      return NextResponse.json<ApiErrorResponse>(
        { error: getServerDict().api.search.INVALID_USERNAME, code: 'INVALID_USERNAME' },
        { status: 400 }
      )
    }

    // username 格式校验：去掉 @ 前缀后仅允许 TikTok 合法字符（1-24 位字母/数字/点/下划线），
    // 拦截垃圾查询，避免无意义的 RapidAPI 配额消耗
    const normalizedKeywords = keywords.trim().replace(/^@/, '')
    if (!/^[a-z0-9._]{1,24}$/i.test(normalizedKeywords)) {
      return NextResponse.json<ApiErrorResponse>(
        { error: getServerDict().api.search.INVALID_USERNAME, code: 'INVALID_USERNAME' },
        { status: 400 }
      )
    }

    // IP 限流：保护 RapidAPI 搜索配额（20 次/小时；限流服务异常时 fail-open 放行）
    const ipAllowed = await checkIpRateLimit(ipBucketKey('search', req), { limit: 20, windowHours: 1 })
    if (!ipAllowed) {
      return rateLimitResponse(getServerDict().api.search.RATE_LIMIT)
    }

    const results = await searchUsers(normalizedKeywords, count)
    return NextResponse.json({ results })
  } catch (err) {
    const code: ApiCode = (err && typeof err === 'object' && 'code' in err)
      ? (err as { code: ApiCode }).code
      : 'API_ERROR'
    const detail = err instanceof Error ? err.message : String(err)
    const mapping = CODE_TO_HTTP[code] || CODE_TO_HTTP.API_ERROR

    console.error(`[search] ${code} | query=${keywords || 'N/A'} | ${detail}`)
    recordEventFromRequest(req, {
      event_type: 'api_error',
      path: '/api/search',
      metadata: {
        error_code: code,
        error_message: detail.slice(0, 200),
      },
    }).catch(e => console.warn('[search] recordEvent(error) failed:', e))
    return NextResponse.json<ApiErrorResponse>(
      { error: mapping.message, code },
      { status: mapping.status }
    )
  }
}