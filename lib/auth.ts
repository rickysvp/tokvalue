/**
 * Auth utilities: verification codes with Postgres (Vercel) or file (local) persistence,
 * rate limiting, and lightweight JWT session tokens (JWS HS256).
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { SignJWT, jwtVerify } from 'jose'
import type { NeonQueryFunction } from '@neondatabase/serverless'
import { withFileLock, atomicWriteJson, dataDir as DATA_DIR } from '@/lib/file-lock'

const CODES_FILE = path.join(DATA_DIR, 'verification_codes.json')
const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')

let sql: NeonQueryFunction<false, false> | null = null
let pgReady = false

async function ensurePg(): Promise<NeonQueryFunction<false, false> | null> {
  if (pgReady) return sql
  if (!DATABASE_URL) {
    console.warn('[auth] ensurePg: no DATABASE_URL configured')
    return null
  }
  try {
    const { neon } = await import('@neondatabase/serverless')
    sql = neon(DATABASE_URL)
    await sql`
      CREATE TABLE IF NOT EXISTS verification_codes (
        email TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        package_id TEXT NOT NULL,
        credits INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        expires_at BIGINT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        send_count_24h INTEGER NOT NULL DEFAULT 0
      )
    `
    pgReady = true
    console.log('[auth] ensurePg: Postgres connected successfully')
    return sql
  } catch (err) {
    console.warn('[auth] ensurePg: Postgres init failed, falling back to file:', err instanceof Error ? err.message : err)
    return null
  }
}

// ── JWT Secret ──
// 生产环境必须显式配置 JWT_SECRET；缺失时 fail-closed，绝不降级派生（DB 凭据泄露即可伪造会话）。
function getJwtSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET
  if (raw && raw.length >= 32) {
    return new TextEncoder().encode(raw)
  }
  if (process.env.NODE_ENV === 'development') {
    console.warn('[auth] Using dev JWT secret — sessions will not survive restarts')
    return new TextEncoder().encode('dev-jwt-secret-min-32-bytes-long!')
  }
  // 生产环境：fail-closed，绝不降级
  throw new Error(
    '[auth] FATAL: JWT_SECRET must be set (>=32 chars) in production. Refusing to serve.'
  )
}

const TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60 // 7 days

export interface PendingCode {
  code: string
  email: string
  packageId: string
  credits: number
  amount: number
  expiresAt: number
  attempts: number
  createdAt: number
  sendCount24h: number
}

export interface AuthPayload {
  email: string
}

// ── File helpers (local dev fallback) ──

function readCodes(): Record<string, PendingCode> {
  try {
    if (fs.existsSync(CODES_FILE)) {
      return JSON.parse(fs.readFileSync(CODES_FILE, 'utf-8'))
    }
  } catch {}
  return {}
}

function writeCodes(codes: Record<string, PendingCode>) {
  atomicWriteJson(CODES_FILE, codes)
}

// ── Verification codes ──

export function generateCode(): string {
  return crypto.randomInt(100000, 1000000).toString()
}

const MAX_ATTEMPTS = 5
const CODE_TTL_MS = 10 * 60 * 1000
const MAX_SENDS_PER_24H = 5
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000

export async function storeCode(
  email: string,
  packageId: string,
  credits: number,
  amount: number,
): Promise<{ code: string; sendCount24h: number; rateLimited: boolean }> {
  const key = email.toLowerCase().trim()
  const code = generateCode()
  const now = Date.now()

  const pg = await ensurePg()
  if (pg) {
    // Postgres path
    const existing = await pg`SELECT code, attempts, send_count_24h, created_at, expires_at FROM verification_codes WHERE email = ${key}`
    const windowStart = now - RATE_LIMIT_WINDOW_MS
    const prev = existing[0]
    const previousSends = prev && Number(prev.created_at) > windowStart ? Number(prev.send_count_24h) : 0

    if (previousSends >= MAX_SENDS_PER_24H) {
      // 仍返回已存在的 code（若有），便于前端 devCode/邮件复用，不生成新码
      return { code: prev ? String(prev.code) : code, sendCount24h: previousSends, rateLimited: true }
    }

    // 关键修复：如果未过期的验证码已存在，复用它而非重新生成，
    // 避免重发导致用户邮件里收到的旧码失效而误报“验证码错误”
    const reuseExisting = prev && Number(prev.expires_at) > now
    const finalCode = reuseExisting ? String(prev.code) : code
    const carriedAttempts = reuseExisting ? Number(prev.attempts) : 0

    await pg`
      INSERT INTO verification_codes (email, code, package_id, credits, amount, expires_at, attempts, created_at, send_count_24h)
      VALUES (${key}, ${finalCode}, ${packageId}, ${credits}, ${amount}, ${now + CODE_TTL_MS}, ${carriedAttempts}, ${now}, ${previousSends + 1})
      ON CONFLICT (email) DO UPDATE SET
        code = EXCLUDED.code,
        package_id = EXCLUDED.package_id,
        credits = EXCLUDED.credits,
        amount = EXCLUDED.amount,
        expires_at = EXCLUDED.expires_at,
        attempts = EXCLUDED.attempts,
        created_at = EXCLUDED.created_at,
        send_count_24h = EXCLUDED.send_count_24h
    `
    console.log('[auth] storeCode: stored code for', key, 'reused:', reuseExisting, 'packageId:', packageId, 'credits:', credits)
    return { code: finalCode, sendCount24h: previousSends + 1, rateLimited: false }
  }

  // File fallback (local dev)
  return withFileLock(CODES_FILE, async () => {
    const all = readCodes()
    const existing = all[key]
    const windowStart = now - RATE_LIMIT_WINDOW_MS
    const previousSends = existing && existing.createdAt > windowStart ? existing.sendCount24h : 0

    if (previousSends >= MAX_SENDS_PER_24H) {
      return { code: existing?.code ?? code, sendCount24h: previousSends, rateLimited: true }
    }

    // 关键修复：未过期的验证码存在时复用，不重新生成（见 Postgres 路径说明）
    const reuseExisting = existing && existing.expiresAt > now
    const finalCode = reuseExisting ? existing!.code : code
    const carriedAttempts = reuseExisting ? existing!.attempts : 0

    all[key] = {
      code: finalCode,
      email: key,
      packageId,
      credits,
      amount,
      expiresAt: now + CODE_TTL_MS,
      attempts: carriedAttempts,
      createdAt: now,
      sendCount24h: previousSends + 1,
    }
    writeCodes(all)
    return { code: finalCode, sendCount24h: previousSends + 1, rateLimited: false }
  })
}

export async function cleanupExpiredCodes(): Promise<void> {
  try {
    const pg = await ensurePg()
    if (pg) {
      await pg`DELETE FROM verification_codes WHERE expires_at < ${Date.now()}`
      return
    }
    await withFileLock(CODES_FILE, async () => {
      const all = readCodes()
      const now = Date.now()
      let changed = false
      for (const [key, entry] of Object.entries(all)) {
        if (entry.expiresAt < now) {
          delete all[key]
          changed = true
        }
      }
      if (changed) writeCodes(all)
    })
  } catch (err) {
    console.warn('[auth] cleanupExpiredCodes failed:', err)
  }
}

export async function verifyCode(
  email: string,
  code: string,
): Promise<{ ok: true; entry: PendingCode } | { ok: false; reason: 'expired' | 'wrong' | 'not_found' | 'too_many' }> {
  const key = email.toLowerCase().trim()
  const trimmedCode = code.trim()
  const now = Date.now()

  const pg = await ensurePg()
  if (pg) {
    const rows = await pg`SELECT * FROM verification_codes WHERE email = ${key}`
    console.log('[auth] verifyCode: DB query returned', rows.length, 'rows for', key)
    const row = rows[0] as Record<string, unknown> | undefined
    if (!row) {
      console.warn('[auth] verifyCode: no code found for email:', key)
      return { ok: false, reason: 'not_found' }
    }

    const entry: PendingCode = {
      code: String(row.code),
      email: String(row.email),
      packageId: String(row.package_id),
      credits: Number(row.credits),
      amount: Number(row.amount),
      expiresAt: Number(row.expires_at),
      attempts: Number(row.attempts),
      createdAt: Number(row.created_at),
      sendCount24h: Number(row.send_count_24h),
    }

    // 不打印验证码明文（stored/input 均不落日志），仅保留 email 与匹配结果
    console.log('[auth] verifyCode: found entry for', key, 'code: ******', 'match:', entry.code === trimmedCode)

    if (now > entry.expiresAt) {
      await pg`DELETE FROM verification_codes WHERE email = ${key}`
      return { ok: false, reason: 'expired' }
    }
    if (entry.attempts >= MAX_ATTEMPTS) {
      await pg`DELETE FROM verification_codes WHERE email = ${key}`
      return { ok: false, reason: 'too_many' }
    }
    if (entry.code !== trimmedCode) {
      await pg`UPDATE verification_codes SET attempts = attempts + 1 WHERE email = ${key}`
      return { ok: false, reason: 'wrong' }
    }
    await pg`DELETE FROM verification_codes WHERE email = ${key}`
    return { ok: true, entry }
  }

  // File fallback (local dev)
  return withFileLock(CODES_FILE, async () => {
    const all = readCodes()
    const entry = all[key]
    if (!entry) return { ok: false, reason: 'not_found' }

    if (Date.now() > entry.expiresAt) {
      delete all[key]
      writeCodes(all)
      return { ok: false, reason: 'expired' }
    }
    if (entry.attempts >= MAX_ATTEMPTS) {
      delete all[key]
      writeCodes(all)
      return { ok: false, reason: 'too_many' }
    }
    entry.attempts += 1
    if (entry.code !== trimmedCode) {
      writeCodes(all)
      return { ok: false, reason: 'wrong' }
    }
    delete all[key]
    writeCodes(all)
    return { ok: true, entry }
  })
}

// ── JWT session tokens ──

export async function createSessionToken(email: string): Promise<string> {
  const secret = getJwtSecret()
  return new SignJWT({ email: email.toLowerCase().trim() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_MAX_AGE_SECONDS}s`)
    .sign(secret)
}

export async function verifySessionToken(token: string): Promise<AuthPayload | null> {
  try {
    const secret = getJwtSecret()
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    if (typeof payload.email !== 'string' || !payload.email) return null
    return { email: payload.email.toLowerCase().trim() }
  } catch (err) {
    console.warn('[auth] token verification failed:', err instanceof Error ? err.message : err)
    return null
  }
}

export function getBearerToken(req: { headers: { get: (name: string) => string | null } }): string | null {
  const auth = req.headers.get('authorization') || ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}