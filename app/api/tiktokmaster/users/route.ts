import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import { adminDeductCredits, adminDisableUser, adminEnableUser, adminDeleteUser } from '@/lib/admin-credits'

export const dynamic = 'force-dynamic'

const DEDUCT_REASONS = [
  '客户退款',
  '违规操作',
  '系统修正',
  '误发回收',
  '其他',
]

export async function POST(req: NextRequest) {
  const authError = await requireAdminAuth(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const { action, email, credits, reason } = body as {
      action: 'deduct' | 'disable' | 'enable' | 'delete'
      email: string
      credits?: number
      reason: string
    }

    if (!email || !action || !reason) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 })
    }

    switch (action) {
      case 'deduct': {
        if (!credits || credits <= 0) {
          return NextResponse.json({ error: '扣减次数必须大于0' }, { status: 400 })
        }
        const result = await adminDeductCredits(email, credits, reason)
        return NextResponse.json({ success: true, remainingCredits: result.remainingCredits })
      }
      case 'disable': {
        await adminDisableUser(email, reason)
        return NextResponse.json({ success: true, message: '用户已禁用' })
      }
      case 'enable': {
        await adminEnableUser(email, reason)
        return NextResponse.json({ success: true, message: '用户已解禁' })
      }
      case 'delete': {
        await adminDeleteUser(email, reason)
        return NextResponse.json({ success: true, message: '用户已删除' })
      }
      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 })
    }
  } catch (err) {
    console.error('[admin-users] error:', err)
    return NextResponse.json({ error: '操作失败' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ deductReasons: DEDUCT_REASONS })
}