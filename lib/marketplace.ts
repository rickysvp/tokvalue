// 交易撮合模块纯逻辑：常量、输入校验、估值快照提取（无 DB 依赖，可单测）
import type { Evaluation } from '../types'

export const UNLOCK_PACKAGE_ID = 'unlock1'
export const UNLOCK_PRICE_USD = 3.99
export const MAX_ACTIVE_LISTINGS_PER_EMAIL = 5
export const REPORT_REMOVE_THRESHOLD = 3
export const MAX_DESCRIPTION_LENGTH = 500
export const MIN_ASKING_PRICE = 1
export const MAX_ASKING_PRICE = 10_000_000

export const SOCIAL_TYPES = ['discord', 'whatsapp', 'telegram'] as const
export type SocialType = (typeof SOCIAL_TYPES)[number]

export const LISTING_STATUSES = ['active', 'sold', 'withdrawn', 'removed'] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

export interface ListingInput {
  username: string
  askingPriceUsd: number
  description: string | null
  contactEmail: string
  socialType: SocialType | null
  socialHandle: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateListingInput(input: ListingInput): { ok: true } | { ok: false; error: string } {
  if (!input.username || !/^[a-z0-9._]{2,24}$/.test(input.username)) {
    return { ok: false, error: 'INVALID_USERNAME' }
  }
  if (!Number.isFinite(input.askingPriceUsd) || input.askingPriceUsd < MIN_ASKING_PRICE || input.askingPriceUsd > MAX_ASKING_PRICE) {
    return { ok: false, error: 'INVALID_PRICE' }
  }
  if (input.description != null && input.description.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, error: 'DESCRIPTION_TOO_LONG' }
  }
  if (!EMAIL_RE.test(input.contactEmail)) {
    return { ok: false, error: 'INVALID_CONTACT_EMAIL' }
  }
  if (input.socialType != null && !SOCIAL_TYPES.includes(input.socialType)) {
    return { ok: false, error: 'INVALID_SOCIAL_TYPE' }
  }
  if (input.socialType != null && (!input.socialHandle || !input.socialHandle.trim())) {
    return { ok: false, error: 'SOCIAL_HANDLE_REQUIRED' }
  }
  return { ok: true }
}

export interface ListingSnapshot {
  snapshotTier: string | null
  snapshotValuationLow: number | null
  snapshotValuationHigh: number | null
  snapshotValuationUsd: number | null
  snapshotFollowers: number | null
  snapshotEngagementRate: number | null
  snapshotEvaluatedAt: string | null
}

// 从 evaluations 行提取不可变估值快照；字段缺失时置 null，不抛错
export function buildSnapshot(e: Evaluation): ListingSnapshot {
  const tv = e.businessValue?.totalValue
  return {
    snapshotTier: e.tier ?? null,
    snapshotValuationLow: tv?.low ?? null,
    snapshotValuationHigh: tv?.high ?? null,
    snapshotValuationUsd: tv?.mid ?? null,
    snapshotFollowers: e.followerCount ?? null,
    snapshotEngagementRate: e.metrics?.engagementRate ?? null,
    snapshotEvaluatedAt: e.computedAt ? String(e.computedAt) : null,
  }
}

export function shouldAutoRemove(reportCount: number): boolean {
  return reportCount >= REPORT_REMOVE_THRESHOLD
}
