'use client'

// ── Baseline / Since-last-review 对比条（Spec §8）──
// 首评：baseline 文案、无变化标记；次评：评分 / 价值 delta。
// 旧报告无 baselineReview / previousReview → 不渲染（向后兼容）。

import type { Evaluation } from '@/types'
import { TIER_COLORS } from '@/lib/tier'
import { CalendarClock } from 'lucide-react'

export function BaselineStrip({ result }: { result: Evaluation }) {
  const prev = result.previousReview

  // 首评：Baseline 文案（无变化标记）
  if (result.baselineReview) {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-2.5 text-xs leading-relaxed text-neutral-400">
        <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00F2EA]" />
        <span>
          <span className="font-semibold text-neutral-200">Baseline review</span> — first snapshot for this
          account. Re-evaluate after new posts to track what moves your value.
        </span>
      </div>
    )
  }

  // 旧报告或字段缺失 → 不渲染
  if (!prev) return null

  // 次评：since last review delta
  const up = TIER_COLORS.B
  const down = TIER_COLORS.S
  const scoreDelta = result.score - prev.score
  const mid = result.valuationV2?.range.mid ?? result.businessValue?.totalValue.mid ?? 0
  const valuePct = prev.valueMid > 0 ? Math.round(((mid - prev.valueMid) / prev.valueMid) * 100) : null
  const date = new Date(prev.computedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px]">
      <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-neutral-400">
        <CalendarClock className="h-3 w-3" />
        Since last review · {date}
      </span>
      <span
        className="rounded-full border px-2.5 py-1 font-semibold"
        style={{ color: scoreDelta >= 0 ? up : down, borderColor: `${scoreDelta >= 0 ? up : down}44` }}
      >
        Score {scoreDelta >= 0 ? '+' : ''}{scoreDelta}
      </span>
      {valuePct !== null && (
        <span
          className="rounded-full border px-2.5 py-1 font-semibold"
          style={{ color: valuePct >= 0 ? up : down, borderColor: `${valuePct >= 0 ? up : down}44` }}
        >
          Value {valuePct >= 0 ? '+' : ''}{valuePct}%
        </span>
      )}
    </div>
  )
}
