// lib/teaser.ts
import type { Evaluation, Post } from '@/types'
import { valuationRangeOf } from './pillar'

/**
 * Teaser 免费边界（Spec §3.3）——纯函数，供 evaluate 路由 FREE 路径裁剪响应。
 *
 * 可见：账号公开信息 / score+tier（头部仪表）/ 价值区间（仅 totalValue，无分项）/
 *       置信度 + 价值层级（commercialSnapshot 子集）/ 最大瓶颈（1 条）/ Top3 视频。
 * 锁定：估值四分项、dimensions/metrics/peerBenchmark、summary/verdict/advice、
 *       commercialSnapshot 的 readinessScore/positioning/strongestLever/nextMove/suggestedRateRange。
 * DB 仍存全量（is_free=true），付费解锁后 upgrade 路由补发完整报告。
 */
export type AccessLevel = 'teaser' | 'full'

export interface TeaserCommercialSnapshot {
  readinessBand: 'Premium Value' | 'Strong Value' | 'Growth Value' | 'Early Value'
  dataConfidence: 'high' | 'medium' | 'low'
  primaryRateBlocker: { label: string; detail: string; impact: string }
}

export interface TeaserBusinessValue {
  totalValue: { low: number; mid: number; high: number }
}

export type TeaserPayload = Partial<Omit<Evaluation, 'businessValue' | 'commercialSnapshot'>> & {
  businessValue?: TeaserBusinessValue
  commercialSnapshot?: TeaserCommercialSnapshot
  isFree: true
  access_level: 'teaser'
}

/** posts 按 playCount 降序取前 N（Teaser Top3 视频用） */
export function topPostsByPlays(posts: Post[] | undefined, n = 3): Post[] {
  if (!Array.isArray(posts)) return []
  return [...posts].sort((a, b) => b.playCount - a.playCount).slice(0, n)
}

export function stripForTeaser(evaluation: Evaluation): TeaserPayload {
  // 免费仅保留一个 primary rate blocker（high > medium > low）
  const rank = { high: 0, medium: 1, low: 2 }
  const primaryBlocker = [...(evaluation.riskFlags || [])].sort((a, b) => rank[a.level] - rank[b.level])[0]

  const snap = evaluation.commercialSnapshot
  const teaserSnap: TeaserCommercialSnapshot | undefined = snap
    ? {
        readinessBand: snap.readinessBand,
        dataConfidence: snap.dataConfidence,
        primaryRateBlocker: snap.primaryRateBlocker,
      }
    : undefined

  return {
    isFree: true,
    access_level: 'teaser',
    // ── 账号公开信息（头部卡片 + 基础统计）──
    username: evaluation.username,
    nickname: evaluation.nickname,
    avatar: evaluation.avatar,
    avatarData: evaluation.avatarData,
    bio: evaluation.bio,
    verified: evaluation.verified,
    mock: evaluation.mock,
    region: evaluation.region,
    followerCount: evaluation.followerCount,
    followingCount: evaluation.followingCount,
    totalLikes: evaluation.totalLikes,
    videoCount: evaluation.videoCount,
    accountProfile: evaluation.accountProfile,
    computedAt: evaluation.computedAt,
    // ── Teaser 核心（Spec §3.3）──
    score: evaluation.score,
    tier: evaluation.tier,
    businessValue: evaluation.businessValue
      ? {
          // Spec §7.3：区间宽度按置信度 band 重算（低置信更宽）；旧报告无 valuationV2 → 原样透传
          totalValue: evaluation.valuationV2
            ? valuationRangeOf(evaluation.businessValue.totalValue.mid, evaluation.valuationV2.band)
            : evaluation.businessValue.totalValue,
        }
      : undefined,
    commercialSnapshot: teaserSnap,
    riskFlags: primaryBlocker ? [primaryBlocker] : [],
    posts: topPostsByPlays(evaluation.posts, 3),
  }
}
