/**
 * Client-side credits helpers — localStorage + API calls.
 * Safe to import from client components only.
 */

import type { CreditBalance } from './credits'

const ACTIVE_EMAIL_KEY = 'tokvalue_active_email'
const TOKEN_KEY = 'tokvalue_session_token'
const PENDING_TOKEN_KEY = 'tokvalue_pending_token'
const CODES_KEY = 'tokvalue_codes_v1'

export function getActiveEmail(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(ACTIVE_EMAIL_KEY)
  } catch { return null }
}

export function setActiveEmail(email: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (email) localStorage.setItem(ACTIVE_EMAIL_KEY, email)
    else localStorage.removeItem(ACTIVE_EMAIL_KEY)
  } catch {}
}

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch { return null }
}

export function setSessionToken(token: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {}
}

/** 临时存储 token（支付流程用，sessionStorage，浏览器关闭即清除） */
export function setPendingToken(token: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (token) sessionStorage.setItem(PENDING_TOKEN_KEY, token)
    else sessionStorage.removeItem(PENDING_TOKEN_KEY)
  } catch {}
}

/** 读取临时 token 并晋升为正式 token（支付成功后调用） */
export function promotePendingToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const pending = sessionStorage.getItem(PENDING_TOKEN_KEY)
    if (pending) {
      localStorage.setItem(TOKEN_KEY, pending)
      sessionStorage.removeItem(PENDING_TOKEN_KEY)
      return pending
    }
    return null
  } catch { return null }
}

function authHeaders() {
  const token = getSessionToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function fetchBalance(email?: string | null): Promise<CreditBalance | null> {
  try {
    const e = (email || getActiveEmail())?.toLowerCase().trim()
    if (!e) return null
    const res = await fetch('/api/credits/balance', {
      headers: authHeaders(),
    })
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    if (!data) return null
    if (data.email) setActiveEmail(data.email)
    return data || null
  } catch { return null }
}

export async function consumeCreditApi(): Promise<{ ok: boolean; balance?: CreditBalance; error?: string }> {
  try {
    if (!getSessionToken()) return { ok: false, error: 'NO_SESSION' }
    const res = await fetch('/api/credits/consume', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    })
    const data = await res.json().catch(() => ({ error: 'CONSUME_FAILED' }))
    if (!res.ok) return { ok: false, error: data.error || 'CONSUME_FAILED' }
    return { ok: true, balance: data.balance }
  } catch { return { ok: false, error: 'NETWORK_ERROR' } }
}

// Claim pending purchase after payment redirect.
// 双通道：有 token 走 JWT；无 token 走 guest（body 携带 activeEmail，
// 配合支付成功回跳 ?paid=success&email=... 使用）。
// guest 认领成功后服务端随响应下发会话 token，此处落存储后即为登录态。
export async function claimCreditsApi(): Promise<{ claimed: boolean; credits: number; email: string } | null> {
  try {
    const token = getSessionToken()
    const guestEmail = token ? null : getActiveEmail()?.toLowerCase().trim()
    // 无 token 且无邮箱时无法定位 pending 记录，直接放弃
    if (!token && !guestEmail) return null
    const res = await fetch('/api/credits/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(token ? {} : { email: guestEmail }),
    })
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    if (!data) return null
    // Guest 通道：存储服务端签发的会话 token，转为登录态
    if (typeof data.token === 'string' && data.token) setSessionToken(data.token)
    return data
  } catch { return null }
}

// Client-side tracking of pending verification state
export function setPendingEmail(email: string, packageId: string) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(CODES_KEY, JSON.stringify({ email, packageId, sentAt: Date.now() }))
  } catch {}
}

export function getPendingEmail(): { email: string; packageId: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(CODES_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function clearPendingEmail() {
  if (typeof window === 'undefined') return
  try { sessionStorage.removeItem(CODES_KEY) } catch {}
}
