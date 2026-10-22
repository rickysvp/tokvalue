import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  findReusablePaidEvaluation: vi.fn(), hasOwnership: vi.fn(), upsertOwnership: vi.fn(),
  findEvaluation: vi.fn(), findFreeEvaluation: vi.fn(), saveEvaluation: vi.fn(),
  checkFreeRateLimit: vi.fn(), isEvaluationPaid: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getBearerToken: vi.fn(() => 'token'), verifySessionToken: vi.fn(async () => ({ email: 'buyer@example.com' })) }))
vi.mock('@/lib/credits-server', () => ({ consumeCredit: vi.fn(async () => ({ ok: true })), refundCredit: vi.fn(), consumeFreeAllowance: vi.fn() }))
vi.mock('@/lib/reviews', () => ({ createOrGetReview: vi.fn(async () => ({ kind: 'unavailable' })), reconcileInFlight: vi.fn(), transitionReview: vi.fn(), failReview: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ recordEventFromRequest: vi.fn(async () => {}), recordEvent: vi.fn(async () => {}), recordFreeEvaluate: vi.fn() }))
vi.mock('@/lib/tiktok', () => ({ fetchProfile: vi.fn() }))
vi.mock('@/lib/scoring/commercial', () => ({ hydrateCommercial: vi.fn((v) => v) }))

import { GET, POST } from './route'
import { findReusablePaidEvaluation, hasOwnership, upsertOwnership } from '@/lib/db'
import { consumeCredit } from '@/lib/credits-server'
import { fetchProfile } from '@/lib/tiktok'

const report = { username: 'creator', score: 76, tier: 'B', computedAt: new Date().toISOString(), dataQuality: 'partial' }
const getReq = () => new NextRequest('http://localhost/api/evaluate?username=@Creator', { headers: { Authorization: 'Bearer token' } })
const postReq = () => new NextRequest('http://localhost/api/evaluate', {
  method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: '@Creator' }),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(findReusablePaidEvaluation).mockResolvedValue(report as never)
})

describe('paid report reuse', () => {
  it('reopens an owned report read-only without credit or TikTok', async () => {
    vi.mocked(hasOwnership).mockResolvedValue(true)
    const response = await GET(getReq())
    expect(response.status).toBe(200)
    expect((await response.json()).cached).toBe(true)
    expect(consumeCredit).not.toHaveBeenCalled()
    expect(fetchProfile).not.toHaveBeenCalled()
  })

  it('reuses the same owned report on POST without deducting another credit', async () => {
    vi.mocked(hasOwnership).mockResolvedValue(true)
    const response = await POST(postReq())
    expect(response.status).toBe(200)
    expect((await response.json()).cached).toBe(true)
    expect(consumeCredit).not.toHaveBeenCalled()
    expect(fetchProfile).not.toHaveBeenCalled()
  })

  it('does not expose a paid report to another user via GET', async () => {
    vi.mocked(hasOwnership).mockResolvedValue(false)
    const response = await GET(getReq())
    expect(response.status).toBe(404)
    expect(findReusablePaidEvaluation).not.toHaveBeenCalled()
  })

  it('does not convert a report-store outage into an account-not-found result', async () => {
    vi.mocked(hasOwnership).mockRejectedValue(new Error('database unavailable'))
    const response = await GET(getReq())
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe('REPORT_STORE_UNAVAILABLE')
    expect(fetchProfile).not.toHaveBeenCalled()
  })

  it('unlocks the shared report for a second buyer without fetching TikTok', async () => {
    vi.mocked(hasOwnership).mockResolvedValue(false)
    const response = await POST(postReq())
    expect(response.status).toBe(200)
    expect((await response.json()).cached).toBe(true)
    expect(consumeCredit).toHaveBeenCalledOnce()
    expect(upsertOwnership).toHaveBeenCalledWith('buyer@example.com', 'creator', { isFree: false })
    expect(fetchProfile).not.toHaveBeenCalled()
  })

  it('does not reveal the shared report when the second buyer has no credit', async () => {
    vi.mocked(hasOwnership).mockResolvedValue(false)
    vi.mocked(consumeCredit).mockResolvedValueOnce({ ok: false, reason: 'NO_CREDITS' } as never)
    const response = await POST(postReq())
    expect(response.status).toBe(402)
    expect(upsertOwnership).not.toHaveBeenCalled()
    expect(fetchProfile).not.toHaveBeenCalled()
  })
})
