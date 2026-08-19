// lib/email.ts
/**
 * B7 邮件域：Review 完成邮件 / Day-10 召回 / Admin 告警。
 * Resend-only；RESEND_API_KEY 未配置时 log-skip（绝不抛错阻断主流程）。
 * 模板纯英文（产品单语言）；所有调用方应 fire-and-forget。
 */

interface SendEmailInput {
  to: string
  subject: string
  html: string
}

/** 底层发送：未配置 Resend 或失败只 warn，返回是否发出 */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skip:', subject)
    return false
  }
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
        to,
        subject,
        html,
      }),
    })
    if (!res.ok) {
      console.warn('[email] Resend failed:', subject, await res.text())
      return false
    }
    return true
  } catch (err) {
    console.warn('[email] Resend error:', subject, err)
    return false
  }
}

/** 深色品牌邮件外壳（与产品 #0a0a0a + 抖音青/粉视觉一致） */
function emailShell(inner: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#141414;border:1px solid #262626;border-radius:16px;padding:32px;">
        <tr><td style="padding-bottom:24px;">
          <span style="font-size:18px;font-weight:800;color:#ffffff;">Tok<span style="color:#00F2EA;">Value</span></span>
        </td></tr>
        <tr><td>${inner}</td></tr>
        <tr><td style="padding-top:28px;border-top:1px solid #262626;margin-top:24px;">
          <p style="font-size:11px;line-height:1.6;color:#525252;margin:8px 0 0 0;">
            You are receiving this because you evaluated a TikTok account on TokValue.
            Estimates are based on publicly available data and are not financial advice.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/** Review 完成邮件：付费评估成功保存后触发（免费评估不发） */
export async function sendReviewCompletedEmail(email: string, username: string): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tokvalue.com'
  return sendEmail({
    to: email,
    subject: `Your TikTok account review is ready — @${username}`,
    html: emailShell(`
      <h2 style="font-size:20px;font-weight:700;color:#ffffff;margin:0 0 12px 0;">Your review for @${username} is ready</h2>
      <p style="font-size:14px;line-height:1.7;color:#a3a3a3;margin:0 0 20px 0;">
        We finished scoring <strong style="color:#ffffff;">@${username}</strong> across the six pillars —
        growth momentum, content consistency, audience quality, niche clarity, brand readiness and risk —
        plus your full commercial value estimate and growth plan.
      </p>
      <a href="${appUrl}/evaluate/${username}" style="display:inline-block;background:#00F2EA;color:#0a0a0a;font-size:14px;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;">View my full report</a>
      <p style="font-size:13px;line-height:1.7;color:#737373;margin:20px 0 0 0;">
        Your report stays available in your <a href="${appUrl}/dashboard/reports" style="color:#00F2EA;text-decoration:none;">dashboard</a>.
      </p>
    `),
  })
}

/** Day-10 召回邮件（cron 触发；"Your value may have changed"） */
export async function sendRecallEmail(email: string, username: string): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tokvalue.com'
  return sendEmail({
    to: email,
    subject: `Your value may have changed — @${username}`,
    html: emailShell(`
      <h2 style="font-size:20px;font-weight:700;color:#ffffff;margin:0 0 12px 0;">Your value may have changed</h2>
      <p style="font-size:14px;line-height:1.7;color:#a3a3a3;margin:0 0 20px 0;">
        It has been 10 days since we reviewed <strong style="color:#ffffff;">@${username}</strong>.
        New posts, engagement shifts and follower growth can move your score and value estimate —
        a fresh review shows what changed and what to do next.
      </p>
      <a href="${appUrl}/evaluate/${username}" style="display:inline-block;background:#FF0050;color:#ffffff;font-size:14px;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;">Re-check @${username}</a>
      <p style="font-size:13px;line-height:1.7;color:#737373;margin:20px 0 0 0;">
        Weekly reviews keep your value current — your growth plan tasks are measured at every re-review.
      </p>
    `),
  })
}

/** 对账/系统告警：发给 ADMIN_EMAIL（未配置时 console.error） */
export async function sendAdminAlert(subject: string, detail: string): Promise<boolean> {
  const admin = process.env.ADMIN_EMAIL
  if (!admin) {
    console.error(`[email] ADMIN_ALERT (no ADMIN_EMAIL): ${subject} — ${detail}`)
    return false
  }
  return sendEmail({
    to: admin,
    subject: `[TokValue Alert] ${subject}`,
    html: emailShell(`
      <h2 style="font-size:18px;font-weight:700;color:#FF0050;margin:0 0 12px 0;">${subject}</h2>
      <pre style="font-size:12px;line-height:1.6;color:#a3a3a3;white-space:pre-wrap;background:#0a0a0a;border:1px solid #262626;border-radius:10px;padding:16px;margin:0;">${detail}</pre>
    `),
  })
}
