import { NextResponse } from 'next/server'
import { hashIp } from '@/lib/analytics'
import { getClientIp } from '@/lib/ip'

export const dynamic = 'force-dynamic'

const TO_EMAIL = 'connect@tokvalue.com'

// 简单内存限流：每 IP 每 60 分钟最多 5 次提交
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_MAX = 5
const submissions = new Map<string, { count: number; windowStart: number }>()

function isRateLimited(ipHash: string): boolean {
  const now = Date.now()
  const entry = submissions.get(ipHash)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    submissions.set(ipHash, { count: 1, windowStart: now })
    return false
  }
  entry.count += 1
  return entry.count > RATE_LIMIT_MAX
}

function buildContactEmailHtml(name: string, email: string, topic: string, message: string): string {
  const safe = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0a0a0a;color:#e5e5e5;border-radius:12px">
      <h2 style="color:#fff;margin:0 0 16px">New Contact Form Submission</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;color:#8a8a8a;width:90px">Name</td><td style="padding:8px 0;color:#fff">${safe(name || '—')}</td></tr>
        <tr><td style="padding:8px 0;color:#8a8a8a">Email</td><td style="padding:8px 0;color:#fff">${safe(email)}</td></tr>
        <tr><td style="padding:8px 0;color:#8a8a8a">Topic</td><td style="padding:8px 0;color:#fff">${safe(topic)}</td></tr>
        <tr><td style="padding:8px 0;color:#8a8a8a;vertical-align:top">Message</td><td style="padding:8px 0;color:#fff;white-space:pre-wrap">${safe(message)}</td></tr>
      </table>
      <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #2a2a2a;font-size:12px;color:#8a8a8a">
        Sent from the TokValue contact form · IP hash: <code>${ipHashPlaceholder()}</code>
      </p>
    </div>
  `
}

// 占位避免在模板字符串里直接引用（下面会替换）
function ipHashPlaceholder(): string {
  return '{{ip_hash}}'
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name = '', email = '', topic = 'General', message = '' } = body

    // 基础校验
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email || !emailRegex.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
    }
    if (!message || message.trim().length < 10) {
      return NextResponse.json({ error: 'Message must be at least 10 characters.' }, { status: 400 })
    }
    if (message.length > 5000) {
      return NextResponse.json({ error: 'Message is too long (max 5000 characters).' }, { status: 400 })
    }
    if (name.length > 100 || topic.length > 100) {
      return NextResponse.json({ error: 'Name or topic too long.' }, { status: 400 })
    }

    // 限流
    const ipHash = hashIp(getClientIp(request))
    if (isRateLimited(ipHash)) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.' },
        { status: 429 }
      )
    }

    if (!process.env.RESEND_API_KEY) {
      console.warn('[contact] RESEND_API_KEY not set — email not sent')
      return NextResponse.json({ ok: false, error: 'Email service not configured.' }, { status: 500 })
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@tokvalue.com'
    const html = buildContactEmailHtml(name, email, topic, message).replace(
      '{{ip_hash}}',
      ipHash
    )

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `TokValue Contact <${fromEmail}>`,
        to: TO_EMAIL,
        replyTo: email,
        subject: `[Contact] ${topic} — ${name || email}`,
        html,
      }),
    })

    if (!res.ok) {
      console.warn('[contact] Resend failed:', await res.text())
      return NextResponse.json({ ok: false, error: 'Failed to send message.' }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[contact] error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
