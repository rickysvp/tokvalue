import { NextRequest, NextResponse } from 'next/server'

/**
 * API 鉴权中间件：对敏感 API 路由进行基本的 token 检查。
 * 完整的 JWT 验证在路由处理器内部完成（verifySessionToken），
 * 此处仅做快速前置检查，防止未授权请求进入业务逻辑。
 * 
 * 保护的路由：
 * - /api/evaluate (POST)：评估账号
 * - /api/history (GET)：用户历史记录
 * - /api/credits/*：积分相关操作
 * 
 * 注意：管理后台路由 (/api/tiktokmaster/*) 使用独立的 verifyAdminRequest() 验证。
 */
const PROTECTED_API_PATTERNS = [
  '/api/evaluate',
  '/api/history',
  '/api/checkout',
  '/api/credits/consume',
  '/api/credits/claim',
  '/api/credits/balance',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const method = request.method

  // 只对 POST /api/evaluate 和 GET /api/history 等敏感路由进行基本检查
  const isProtectedRoute = PROTECTED_API_PATTERNS.some(
    pattern => pathname === pattern
  )

  if (isProtectedRoute) {
    // 对于 POST /api/evaluate，必须有 Authorization header
    if (pathname === '/api/evaluate' && method === 'POST') {
      const auth = request.headers.get('authorization')
      if (!auth || !auth.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Authentication required', code: 'UNAUTHORIZED' },
          { 
            status: 401,
            headers: { 'Cache-Control': 'no-store, max-age=0' }
          }
        )
      }
    }

    // 对于 POST /api/checkout，必须有 Authorization header
    if (pathname === '/api/checkout' && method === 'POST') {
      const auth = request.headers.get('authorization')
      if (!auth || !auth.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Authentication required', code: 'UNAUTHORIZED' },
          { 
            status: 401,
            headers: { 'Cache-Control': 'no-store, max-age=0' }
          }
        )
      }
    }

    // 对于 GET /api/history，必须有 Authorization header
    if (pathname === '/api/history' && method === 'GET') {
      const auth = request.headers.get('authorization')
      if (!auth || !auth.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Authentication required', code: 'UNAUTHORIZED' },
          { 
            status: 401,
            headers: { 'Cache-Control': 'no-store, max-age=0' }
          }
        )
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
