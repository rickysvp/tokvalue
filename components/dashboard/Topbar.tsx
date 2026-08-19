'use client'

// ── Dashboard 全局顶栏（B5b，Spec §6）──
// `@{username} · {n} reviews remaining · Last reviewed: {date}` + [Update my account]
// 数据源：DashboardDataProvider（/api/history 最近一条 + /api/credits/balance）。

import { Loader2 } from 'lucide-react'
import { TIER_COLORS } from '@/lib/tier'
import { formatReviewDate } from './shared'
import { useDashboardData } from './dashboard-data'
import { UpdateAccountButton } from './UpdateAccountButton'

export function Topbar() {
  const { latest, balance, loading } = useDashboardData()
  const cyan = TIER_COLORS.B

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-800 bg-[#0a0a0a]/95 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-neutral-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: cyan }} />
            Loading your account…
          </p>
        ) : latest ? (
          <p className="text-sm text-neutral-400">
            <span className="font-semibold text-white">@{latest.username}</span>
            <span className="mx-2 text-neutral-700" aria-hidden="true">·</span>
            <span>
              {balance ? `${balance.credits} review${balance.credits === 1 ? '' : 's'} remaining` : 'Reviews remaining: —'}
            </span>
            <span className="mx-2 text-neutral-700" aria-hidden="true">·</span>
            <span>Last reviewed: {formatReviewDate(latest.computedAt)}</span>
          </p>
        ) : (
          <p className="text-sm text-neutral-400">
            <span className="font-semibold text-white">No account evaluated yet</span>
            <span className="mx-2 text-neutral-700" aria-hidden="true">·</span>
            <span>
              {balance ? `${balance.credits} review${balance.credits === 1 ? '' : 's'} remaining` : 'Reviews remaining: —'}
            </span>
          </p>
        )}
        <UpdateAccountButton latest={latest} size="sm" />
      </div>
    </header>
  )
}
