'use client'

// ── Dashboard 共享样式工具（B5b）──
// 硬约束：色值一律读 lib/tier.ts 的 TIER_COLORS（neutral 灰黑系列除外），
// 状态词→组色沿用 PillarSection 既有映射：Strong=S/A、On track=B/C、Needs attention=D/E。

import type { PillarStatus } from '@/types'
import { TIER_COLORS } from '@/lib/tier'

/** 状态词 → TIER_COLORS 组色（与报告页 PillarSection 保持一致） */
export const STATUS_COLORS: Record<PillarStatus, string> = {
  Strong: TIER_COLORS.S,
  'On track': TIER_COLORS.B,
  'Needs attention': TIER_COLORS.D,
}

/** 置信度分档文案（与 CommercialSnapshotTab 一致） */
export const CONFIDENCE_LABELS: Record<string, string> = {
  medium_high: 'Medium-High confidence',
  medium: 'Medium confidence',
  medium_low: 'Medium-Low confidence',
  low: 'Low confidence',
}

/** #RRGGBB + alpha → rgba()（用于从 TIER_COLORS 派生半透明背景/边框，避免硬编码色值） */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** 同一（用户, 账号）24h 内最多 1 次 Review（Spec D5）→ Topbar/额度卡共用冷却逻辑 */
export function reviewCooldown(computedAt: string | null | undefined): { inCooldown: boolean; hoursLeft: number } {
  if (!computedAt) return { inCooldown: false, hoursLeft: 0 }
  const hoursSince = (Date.now() - new Date(computedAt).getTime()) / 3_600_000
  if (!(hoursSince >= 0) || hoursSince >= 24) return { inCooldown: false, hoursLeft: 0 }
  return { inCooldown: true, hoursLeft: Math.max(1, Math.ceil(24 - hoursSince)) }
}

export function formatReviewDate(computedAt: string): string {
  return new Date(computedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
