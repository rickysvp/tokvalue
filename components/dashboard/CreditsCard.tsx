'use client'

// ── Overview ③ 额度卡（B5b，Spec §6）──
// 剩余评估次数（/api/credits/balance）+ Update 按钮（复用 Topbar 的冷却逻辑）。

import { Zap } from 'lucide-react'
import { TIER_COLORS } from '@/lib/tier'
import { useDashboardData } from './dashboard-data'
import { UpdateAccountButton } from './UpdateAccountButton'

export function CreditsCard() {
  const { latest, balance } = useDashboardData()
  const cyan = TIER_COLORS.B

  return (
    <section className="flex flex-col rounded-2xl border border-neutral-800 bg-[#141414] p-6" aria-label="Review credits">
      <div className="mb-4 flex items-center gap-2">
        <Zap className="h-4 w-4" style={{ color: cyan }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: cyan }}>
          Review Credits
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-black text-white tabular-nums">
          {balance ? balance.credits : '—'}
        </span>
        <span className="text-sm text-neutral-500">reviews remaining</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-neutral-500">
        Each update re-scores your account with the latest public data — weekly reviews keep your value current.
      </p>

      <div className="mt-auto pt-4">
        <UpdateAccountButton latest={latest} />
      </div>
    </section>
  )
}
