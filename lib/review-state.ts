// lib/review-state.ts
/**
 * Review 状态机（纯函数，无 IO）。
 * 状态流转：requested → quota_reserved → fetching_data → data_saved
 *           → analyzing → report_generating → completed
 * 任意活跃态可 → failed（终态）。
 * quota_consumed / quota_released 是 usage_events 里的事件，不是状态。
 */

export const REVIEW_STATUSES = [
  'requested', 'quota_reserved', 'fetching_data', 'data_saved',
  'analyzing', 'report_generating', 'completed', 'failed',
] as const

export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

export const ACTIVE_REVIEW_STATUSES: ReviewStatus[] = [
  'requested', 'quota_reserved', 'fetching_data', 'data_saved',
  'analyzing', 'report_generating',
]

const TRANSITIONS: Record<Exclude<ReviewStatus, 'completed' | 'failed'>, ReviewStatus[]> = {
  requested: ['quota_reserved', 'failed'],
  quota_reserved: ['fetching_data', 'failed'],
  fetching_data: ['data_saved', 'failed'],
  data_saved: ['analyzing', 'failed'],
  analyzing: ['report_generating', 'failed'],
  report_generating: ['completed', 'failed'],
}

/** 各活跃状态允许停留的最大时长；超时由惰性对账判 failed 并释放额度（Serverless 无 cron 依赖） */
export const REVIEW_TTL_MS: Partial<Record<ReviewStatus, number>> = {
  requested: 5 * 60_000,
  quota_reserved: 5 * 60_000,
  fetching_data: 90_000,
  data_saved: 180_000,
  analyzing: 180_000,
  report_generating: 120_000,
}

export function isTerminalReview(status: ReviewStatus): boolean {
  return status === 'completed' || status === 'failed'
}

export function canTransition(from: ReviewStatus, to: ReviewStatus): boolean {
  if (isTerminalReview(from)) return false
  const allowed = TRANSITIONS[from as Exclude<ReviewStatus, 'completed' | 'failed'>]
  return !!allowed && allowed.includes(to)
}

/** stateEnteredAt 接受 Date / ISO string / epoch ms；终态永不超时 */
export function isStaleReview(
  status: ReviewStatus,
  stateEnteredAt: string | number | Date,
  now: number = Date.now(),
): boolean {
  if (isTerminalReview(status)) return false
  const ttl = REVIEW_TTL_MS[status]
  if (!ttl) return false
  const entered = stateEnteredAt instanceof Date
    ? stateEnteredAt.getTime()
    : new Date(stateEnteredAt).getTime()
  if (!Number.isFinite(entered)) return false
  return now - entered > ttl
}
