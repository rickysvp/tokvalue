import { NextRequest, NextResponse } from 'next/server'
import { CREDIT_PACKAGES, findPackage } from '@/lib/credits'
import { storeCode, cleanupExpiredCodes } from '@/lib/auth'
import { getServerDict } from '@/lib/i18n/server'
import { checkIpRateLimit, ipBucketKey, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LOGO_URL = 'https://tokvalue.com/tokvalue.png'

function buildEmailHtml(code: string, pkgLabel: string, pkgCredits: number, pkgPrice: number): string {
  const digits = code.split('')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TokValue Verification</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#0a0a0a;padding:40px 16px">
    <tr>
      <td align="center">
        <!-- Outer Card -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:#111111;border-radius:16px;border:1px solid #222222;overflow:hidden">
          
          <!-- Top Accent Bar -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#FF0050,#00F2EA);font-size:0;line-height:0">&nbsp;</td>
          </tr>

          <!-- Logo & Header -->
          <tr>
            <td style="padding:32px 32px 0 32px;text-align:center">
              <img src="${LOGO_URL}" alt="TokValue" width="160" height="40" style="display:block;margin:0 auto;height:40px;width:auto;border:0;outline:0">
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td style="padding:28px 32px 0 32px;text-align:center">
              <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3;letter-spacing:-0.3px">
                Verify Your Email
              </h1>
              <p style="margin:8px 0 0 0;font-size:14px;color:#888888;line-height:1.5">
                You're one step away from unlocking your TikTok account insights
              </p>
            </td>
          </tr>

          <!-- Package Info Box -->
          <tr>
            <td style="padding:20px 32px 0 32px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#1a1a1a;border-radius:10px;border:1px solid #2a2a2a">
                <tr>
                  <td style="padding:16px 20px">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="font-size:11px;font-weight:600;color:#888888;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:8px">
                          Selected Package
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <span style="font-size:18px;font-weight:800;color:#ffffff">${pkgLabel}</span>
                          <span style="display:inline-block;margin:0 10px;width:1px;height:16px;background:#333;vertical-align:middle"></span>
                          <span style="font-size:14px;color:#00F2EA;font-weight:700">$${pkgPrice}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size:12px;color:#666666;padding-top:4px">
                          ${pkgCredits} account evaluation${pkgCredits > 1 ? 's' : ''} &middot; Instant access after verification
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Verification Code -->
          <tr>
            <td style="padding:28px 32px 0 32px;text-align:center">
              <p style="margin:0 0 16px 0;font-size:13px;font-weight:600;color:#aaaaaa;letter-spacing:0.3px">
                YOUR VERIFICATION CODE
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
                <tr>
                  ${digits.map((d, i) => `
                  <td style="width:52px;height:64px;text-align:center;vertical-align:middle;background-color:#1a1a1a;border:1px solid #333333;border-radius:10px;font-size:30px;font-weight:900;color:#ffffff;font-family:'SF Mono','Fira Code','Cascadia Code',monospace;letter-spacing:1px;${i < digits.length - 1 ? 'margin-right:8px' : ''}">
                    ${d}
                  </td>
                  ${i < digits.length - 1 ? '<td style="width:8px"></td>' : ''}
                  `).join('')}
                </tr>
              </table>
              <p style="margin:16px 0 0 0;font-size:12px;color:#666666;line-height:1.5">
                This code expires in <strong style="color:#FF0050">10 minutes</strong>
              </p>
              <div style="margin-top:12px;display:inline-block;background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:6px 14px;cursor:pointer;user-select:all;font-family:'SF Mono','Fira Code',monospace;font-size:20px;font-weight:900;color:#00F2EA;letter-spacing:4px">
                ${code}
              </div>
              <p style="margin:8px 0 0 0;font-size:11px;color:#555">
                Click to select &amp; copy the code
              </p>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding:24px 32px 0 32px;text-align:center">
              <p style="margin:0 0 4px 0;font-size:12px;color:#666666">
                Return to the verification page and enter the code above
              </p>
            </td>
          </tr>

          <!-- Value Points -->
          <tr>
            <td style="padding:28px 32px 0 32px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #222222">
                <tr>
                  <td style="padding-top:20px;font-size:12px;font-weight:700;color:#aaaaaa;letter-spacing:0.3px;text-transform:uppercase;padding-bottom:12px">
                    What TokValue Unlocks
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      ${[
                        { icon: '📊', color: '#00F2EA', title: 'Commercial Value Score', desc: 'AI-powered valuation of your TikTok account worth in USD' },
                        { icon: '🔍', color: '#FF0050', title: 'Content Performance Audit', desc: 'Identify what\'s working and what\'s holding you back' },
                        { icon: '📈', color: '#00F2EA', title: 'Growth & Revenue Forecast', desc: 'Data-driven projections to maximize creator earnings' },
                        { icon: '🛡️', color: '#FF0050', title: 'Risk & Shadowban Detection', desc: 'Proactive alerts before algorithm penalties hurt reach' },
                      ].map(item => `
                      <tr>
                        <td style="padding-bottom:14px">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="width:32px;height:32px;text-align:center;vertical-align:middle;background-color:#1a1a1a;border-radius:8px;font-size:15px">
                                ${item.icon}
                              </td>
                              <td style="padding-left:12px">
                                <div style="font-size:13px;font-weight:700;color:#ffffff;line-height:1.3">${item.title}</div>
                                <div style="font-size:11px;color:#777777;line-height:1.4;margin-top:2px">${item.desc}</div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      `).join('')}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 32px 32px 32px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #222222">
                <tr>
                  <td style="padding-top:16px;text-align:center">
                    <p style="margin:0;font-size:11px;color:#555555;line-height:1.6">
                      You received this email because you requested a verification code on TokValue.<br>
                      If you didn't request this, you can safely ignore this email.
                    </p>
                    <p style="margin:12px 0 0 0;font-size:11px;color:#444444">
                      &copy; ${new Date().getFullYear()} TokValue &mdash; TikTok Account Value Intelligence
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  try {
    await cleanupExpiredCodes()
    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const packageId = String(body.packageId || 'pack1')

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: getServerDict().api.auth.INVALID_EMAIL, code: 'INVALID_EMAIL' }, { status: 400 })
    }

    const pkg = packageId === '_returning' ? null : findPackage(packageId)
    if (!pkg && packageId !== '_returning') {
      return NextResponse.json(
        { error: getServerDict().api.auth.INVALID_PACKAGE, code: 'INVALID_PACKAGE', validPackages: CREDIT_PACKAGES.map(p => p.id) },
        { status: 400 }
      )
    }

    // IP 限流：防邮件轰炸（10 次/小时；限流服务异常时 fail-open 放行，不阻断正常业务）
    const ipAllowed = await checkIpRateLimit(ipBucketKey('send-code', req), { limit: 10, windowHours: 1 })
    if (!ipAllowed) {
      return rateLimitResponse(getServerDict().api.auth.RATE_LIMIT)
    }

    // Generate and store 6-digit code (10 min TTL), with per-email rate limiting
    const credits = pkg ? pkg.credits : 0
    const amount = pkg ? pkg.price : 0
    const { code, rateLimited } = await storeCode(email, packageId, credits, amount)
    if (rateLimited) {
      return NextResponse.json(
        { error: getServerDict().api.auth.RATE_LIMIT, code: 'RATE_LIMIT' },
        { status: 429 }
      )
    }

    // --- Email delivery ---
    let emailDelivered = false
    let devCode: string | null = null

    if (process.env.RESEND_API_KEY) {
      try {
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@tokvalue.com'
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `TokValue <${fromEmail}>`,
            to: email,
            subject: `${code} is your TokValue verification code`,
            html: buildEmailHtml(code, pkg?.label ?? 'Account Access', pkg?.credits ?? 0, pkg?.price ?? 0),
          }),
        })
        emailDelivered = res.ok
        if (!res.ok) console.warn('[send-code] Resend failed:', await res.text())
      } catch (err) {
        console.warn('[send-code] Resend error:', err)
      }
    }

    if (!emailDelivered) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[send-code] DEV — code for ${email}: ${code} (package: ${packageId}, ${credits} credits, $${amount})`)
      }
      devCode = process.env.NODE_ENV === 'development' ? code : null
    }

    return NextResponse.json({
      ok: true,
      email,
      packageId,
      devCode,
      delivered: emailDelivered,
      expiresIn: 10 * 60 * 1000,
    })
  } catch (err) {
    console.error('[send-code] error:', err)
    return NextResponse.json({ error: getServerDict().api.auth.SEND_FAILED, code: 'SEND_FAILED' }, { status: 500 })
  }
}