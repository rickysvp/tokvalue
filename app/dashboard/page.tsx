'use client'

// ── Dashboard Overview（B5b，Spec §6）──
// 4 模块（5 秒抓核心，无滚动堆叠）：
// ① 商业价值卡 ② 本周核心问题+最多3任务 ③ 额度卡 ④ 6 支柱简览。
// 无历史评估 → 空态引导首次评估。数据来自 DashboardDataProvider（layout 注入）。

import { Loader2 } from 'lucide-react'
import { TIER_COLORS } from '@/lib/tier'
import { useDashboardData } from '@/components/dashboard/dashboard-data'
import { ValueCard } from '@/components/dashboard/ValueCard'
import { FocusCard } from '@/components/dashboard/FocusCard'
import { CreditsCard } from '@/components/dashboard/CreditsCard'
import { PillarsCard } from '@/components/dashboard/PillarsCard'
import { EmptyOverview } from '@/components/dashboard/EmptyOverview'
import { formatReviewDate } from '@/components/dashboard/shared'

export default function DashboardOverviewPage() {
  const { latest, loading } = useDashboardData()

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: TIER_COLORS.B }} />
      </div>
    )
  }

  if (!latest) {
    return <EmptyOverview />
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Latest snapshot for <span className="text-neutral-300">@{latest.username}</span> ·{' '}
          {formatReviewDate(latest.computedAt)}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ValueCard latest={latest} />
        <FocusCard latest={latest} />
        <CreditsCard />
        <PillarsCard latest={latest} />
      </div>
    </div>
  )
}
