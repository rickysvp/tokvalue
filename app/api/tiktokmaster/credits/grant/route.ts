import { NextRequest, NextResponse } from 'next/server'
import { adminGrantCredits } from '@/lib/admin-credits'
import { requireAdminAuth } from '@/lib/admin-auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  const authError = await requireAdminAuth(req)
  if (authError) return authError
  try {
    const body = await req.json().catch(() => ({}))
    const emails: string[] = Array.isArray(body.emails) ? body.emails : []
    const credits = Number(body.credits)
    const reason = String(body.reason || '').trim()

    // Validation
    if (emails.length === 0 || emails.length > 50) {
      return NextResponse.json({ error: '1-50 emails required' }, { status: 400 })
    }
    for (const email of emails) {
      if (!EMAIL_RE.test(email)) {
        return NextResponse.json({ error: `Invalid email: ${email}` }, { status: 400 })
      }
    }
    if (!Number.isFinite(credits) || credits < 1 || credits > 100) {
      return NextResponse.json({ error: 'Credits must be 1-100' }, { status: 400 })
    }
    if (!reason || reason.length > 500) {
      return NextResponse.json({ error: 'Reason is required (max 500 chars)' }, { status: 400 })
    }

    const result = await adminGrantCredits(emails, credits, reason)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[credits-grant] error:', err)
    return NextResponse.json({ error: 'Failed to grant credits' }, { status: 500 })
  }
}