'use client'

// ── Overview ① 商业价值卡（B5b，Spec §6/§7.3–7.4/§8）──
// totalValue 区间（valuationV2.band 宽度优先）+ 置信度徽章 + 变化：
// 有 previousReview → Score/Value delta；baselineReview（首评）→ Baseline 文案。

import { BarChart3, ShieldCheck, CalendarClock } from 'lucide-react'
import { TIER_COLORS } from '@/lib/tier'
import { valueTierOf, valueTierColor } from '@/lib/pillar'
import { formatNumber } from '@/lib/format'
import { CONFIDENCE_LABELS, withAlpha } from './shared'
import type { DashboardLatest } from './dashboard-data'

export function ValueCard({ latest }: { latest: DashboardLatest }) {
  const cyan = TIER_COLORS.B
  const pink = TIER_COLORS.S
  // Spec §7.3：估值区间 v2——按置信度 band 宽度展示；旧报告无 valuationV2 → 原区间
  const range = latest.valuationV2?.range ?? latest.totalValue
  const prev = latest.previousReview
  const scoreDelta = prev ? latest.score - prev.score : null
  const mid = latest.valuationV2?.range.mid ?? latest.totalValue?.mid ?? 0
  const valuePct = prev && prev.valueMid > 0 ? Math.round(((mid - prev.valueMid) / prev.valueMid) * 100) : null
  const prevDate = prev ? new Date(prev.computedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

  return (
    <section
      className="relative overflow-hidden rounded-2xl border p-6"
      style={{ borderColor: withAlpha(cyan, 0.25), background: `linear-gradient(to bottom right, ${withAlpha(cyan, 0.07)}, ${withAlpha(pink, 0.05)})` }}
      aria-label="Commercial value"
    >
      <div className="relative">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" style={{ color: cyan }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: cyan }}>
              Commercial Value
            </span>
          </div>
          <span
            className="rounded-full border px-2.5 py-1 text-[10px] font-bold"
            style={{ color: valueTierColor(latest.tier), borderColor: withAlpha(valueTierColor(latest.tier), 0.4), backgroundColor: withAlpha(valueTierColor(latest.tier), 0.1) }}
          >
            {valueTierOf(latest.tier)}
          </span>
        </div>

        {range ? (
          <p className="text-3xl font-black tracking-tight text-white tabular-nums sm:text-4xl">
            ${formatNumber(range.low)} – ${formatNumber(range.high)}
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-neutral-400">
            Value range unavailable for this report — update your account to see the current estimate.
          </p>
        )}
        <p className="mt-1 text-xs text-neutral-500">
          Estimated account value for <span className="text-neutral-300">@{latest.username}</span> · mid ${formatNumber(mid)}
        </p>

        {latest.valuationV2 && (
          <div className="mt-4">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
              style={{ color: cyan, borderColor: withAlpha(cyan, 0.3), backgroundColor: withAlpha(cyan, 0.1) }}
            >
              <ShieldCheck className="h-3 w-3" />
              {CONFIDENCE_LABELS[latest.valuationV2.band]}
            </span>
          </div>
        )}

        {/* 变化：次评 delta / 首评 Baseline（Spec §8；旧报告两者皆无 → 不渲染） */}
        {prev && scoreDelta !== null ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-neutral-400">
              <CalendarClock className="h-3 w-3" />
              Since last review · {prevDate}
            </span>
            <span
              className="rounded-full border px-2.5 py-1 font-semibold"
              style={{ color: scoreDelta >= 0 ? cyan : pink, borderColor: withAlpha(scoreDelta >= 0 ? cyan : pink, 0.27) }}
            >
              Score {scoreDelta >= 0 ? '+' : ''}{scoreDelta}
            </span>
            {valuePct !== null && (
              <span
                className="rounded-full border px-2.5 py-1 font-semibold"
                style={{ color: valuePct >= 0 ? cyan : pink, borderColor: withAlpha(valuePct >= 0 ? cyan : pink, 0.27) }}
              >
                Value {valuePct >= 0 ? '+' : ''}{valuePct}%
              </span>
            )}
          </div>
        ) : latest.baselineReview ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 px-3.5 py-2.5 text-xs leading-relaxed text-neutral-400">
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: cyan }} />
            <span>
              <span className="font-semibold text-neutral-200">Baseline review</span> — first snapshot for this
              account. Re-evaluate after new posts to track what moves your value.
            </span>
          </div>
        ) : null}
      </div>
    </section>
  )
}
