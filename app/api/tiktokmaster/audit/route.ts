import { NextRequest, NextResponse } from 'next/server'
import { getAuditLog } from '@/lib/analytics'
import { requireAdminAuth } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  const authError = await requireAdminAuth(req)
  if (authError) return authError
  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200)
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)
  const action = url.searchParams.get('action') || undefined

  try {
    const result = await getAuditLog(limit, offset, action)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[audit] error:', err)
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }
}