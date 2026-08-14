/**
 * Admin authentication — JWT sign/verify + in-memory rate limiting.
 * Only import from API routes / server components.
 *
 * 安全策略：ADMIN_JWT_SECRET 未配置时拒绝签发与校验（生产环境必须配置）。
 * 不再有硬编码回退密钥，避免攻击者用公开字符串伪造 admin JWT。
 */

import { SignJWT, jwtVerify } from 'jose'
import crypto from 'crypto'
import { getClientIp } from './ip'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
const ADMIN_JWT_SECRET_RAW = process.env.ADMIN_JWT_SECRET || ''

if (!ADMIN_PASSWORD && process.env.NODE_ENV === 'production') {
  console.warn('[admin-auth] ADMIN_PASSWORD is not set. Admin login is disabled.')
}
if (!ADMIN_JWT_SECRET_RAW && process.env.NODE_ENV === 'production') {
  console.warn('[admin-auth] ADMIN_JWT_SECRET is not set. Admin token sign/verify will fail.')
}

// 至少 32 字节
function getJwtSecret(): Uint8Array {
  if (!ADMIN_JWT_SECRET_RAW || ADMIN_JWT_SECRET_RAW.length < 32) {
    throw new Error('ADMIN_JWT_SECRET must be set and at least 32 characters')
  }
  return new TextEncoder().encode(ADMIN_JWT_SECRET_RAW)
}

const TOKEN_MAX_AGE = '24h'

// ── Rate limiting (in-memory, per-IP) ──
const attempts = new Map<string, { count: number; lockedUntil: number }>()

export function checkRateLimit(request: Request): { allowed: boolean; retryAfterSec: number } {
  const ip = getClientIp(request)
  const now = Date.now()
  const entry = attempts.get(ip)

  if (entry && entry.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) }
  }

  if (!entry || entry.lockedUntil < now) {
    attempts.set(ip, { count: 1, lockedUntil: 0 })
  } else {
    entry.count++
    if (entry.count > 5) {
      entry.lockedUntil = now + 15 * 60 * 1000 // 15 min lockout
    }
  }

  return { allowed: true, retryAfterSec: 0 }
}

// ── Admin JWT ──

export interface AdminPayload {
  role: 'admin'
}

export async function signAdminToken(): Promise<string> {
  const secret = getJwtSecret()
  return new SignJWT({ role: 'admin' as const })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_MAX_AGE)
    .setJti(crypto.randomUUID())
    .sign(secret)
}

export async function verifyAdminToken(token: string): Promise<AdminPayload | null> {
  try {
    const secret = getJwtSecret()
    const { payload } = await jwtVerify(token, secret)
    if (payload.role === 'admin') {
      return { role: 'admin' }
    }
    return null
  } catch {
    return null
  }
}

export function validatePassword(password: string): boolean {
  if (!ADMIN_PASSWORD) return false
  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(password)
  const b = Buffer.from(ADMIN_PASSWORD)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
