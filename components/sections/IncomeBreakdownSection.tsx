'use client'

import { IncomeEstimate, IncomeSource } from '@/types'
import { DollarSign, TrendingUp, Briefcase, Play, Users, ShoppingBag, Gift, Info } from 'lucide-react'
import { formatUsd } from '@/lib/format'
import { useI18n } from '@/lib/i18n/context'

const iconMap: Record<string, React.ReactNode> = {
  Briefcase: <Briefcase className="h-4 w-4" />,
  Play: <Play className="h-4 w-4" />,
  Users: <Users className="h-4 w-4" />,
  ShoppingBag: <ShoppingBag className="h-4 w-4" />,
  Gift: <Gift className="h-4 w-4" />,
}

const confidenceColors: Record<string, string> = {
  high: 'border-green-800/50 bg-green-950/30',
  medium: 'border-amber-800/50 bg-amber-950/30',
  low: 'border-neutral-800 bg-[#0f0f0f]',
}

const confidenceDots: Record<string, string> = {
  high: 'bg-green-400',
  medium: 'bg-amber-400',
  low: 'bg-neutral-600',
}

export function IncomeBreakdownSection({ estimate }: { estimate: IncomeEstimate }) {
  const { dict } = useI18n()
  const total = estimate.monthlyTotal
  const hasIncome = total.mid > 0

  return (
    <div className="rounded-2xl border border-neutral-800 bg-[#0f0f0f] p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{dict.evaluation.income.estMonthlyIncome}</h3>
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>{estimate.categoryLabel} · {estimate.regionLabel}</span>
          <span className="text-neutral-700">|</span>
          <span>CPM ${estimate.categoryCpm} · RPM ${estimate.categoryRpm.toFixed(2)}</span>
        </div>
      </div>

      {/* Total */}
      <div className="mb-6 rounded-2xl border border-[#00F2EA]/20 bg-gradient-to-br from-[#00F2EA]/5 to-[#FF0050]/5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-neutral-500 mb-1 uppercase tracking-wider">{dict.evaluation.income.estMonthlyRange}</div>
            <div className="text-3xl font-bold">
              {hasIncome ? `${formatUsd(total.low)} - ${formatUsd(total.high)}` : '$0'}
            </div>
            {hasIncome && (
              <div className="text-sm text-neutral-400 mt-1">
                {dict.evaluation.income.median} {formatUsd(total.mid)}
              </div>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-neutral-700 px-4 py-2">
            <TrendingUp className="h-4 w-4 text-[#00F2EA]" />
            <span className="text-sm text-neutral-400">
              {dict.evaluation.income.regionMultiplier} {estimate.regionMultiplier.toFixed(2)}x
            </span>
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-3 mb-4">
        {estimate.breakdown.map((source, idx) => (
          <IncomeRow key={idx} source={source} totalMid={total.mid} />
        ))}
      </div>

      {/* Summary */}
      <div className="flex items-start gap-3 rounded-xl border border-neutral-800 bg-[#141414] p-4 mb-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
        <p className="text-sm text-neutral-400">{estimate.summary}</p>
      </div>

      {/* How we got here — 计算依据 */}
      <details className="rounded-xl border border-neutral-800 bg-black/40 open:bg-neutral-900/40 group">
        <summary className="flex items-center justify-between cursor-pointer select-none px-4 py-3 text-xs text-neutral-400 hover:text-neutral-300 list-none">
          <span className="inline-flex items-center gap-2">
            <Info className="h-3.5 w-3.5" />
            How these numbers are estimated
          </span>
          <span className="text-neutral-600 group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="px-4 pb-4 text-xs text-neutral-400 space-y-2.5 leading-relaxed border-t border-neutral-800/60 pt-3.5">
          <p>These are <strong className="text-neutral-200">ranges, not guarantees</strong> — direction and ballpark only. Actual income depends on content quality, posting frequency, deal structure, and luck.</p>
          <ul className="space-y-2 ml-1.5 list-disc list-outside pl-3">
            <li>
              <strong className="text-neutral-300">Brand deals</strong>: estimated 4–8 sponsored posts per year (based on follower tier and posting cadence), priced by your readiness score × suggested rate per post.
            </li>
            <li>
              <strong className="text-neutral-300">Creator Fund / Play bonus</strong>: monthly plays × RPM <code className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200">${estimate.categoryRpm.toFixed(2)}</code> for <span className="text-neutral-200">{estimate.categoryLabel}</span> in <span className="text-neutral-200">{estimate.regionLabel}</span> (RPM = revenue per 1,000 views; varies by region and category).
            </li>
            <li>
              <strong className="text-neutral-300">Live / Gifts</strong>: estimated from follower count × historical engagement rate × an assumed live conversion (low confidence for most accounts — treat as upside only).
            </li>
            <li>
              <strong className="text-neutral-300">Affiliate / Shop</strong>: monthly plays × category-average click-through × conversion × average order value. Uses a category CPM baseline of <code className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200">${estimate.categoryCpm}</code>.
            </li>
            <li>
              <strong className="text-neutral-300">Region multiplier</strong>: <code className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200">{estimate.regionMultiplier.toFixed(2)}×</code> — advertising and creator-fund payouts scale by audience geography.
            </li>
          </ul>
          <p className="pt-0.5 text-neutral-500 italic">Confidence dots on each row indicate how much real data supports that line (green = solid signal, amber = moderate, grey = upside hypothesis).</p>
        </div>
      </details>
    </div>
  )
}

function IncomeRow({ source, totalMid }: { source: IncomeSource; totalMid: number }) {
  const { dict } = useI18n()
  const hasIncome = source.monthlyAmount.mid > 0
  const barWidth = totalMid > 0 ? Math.max(2, (source.monthlyAmount.mid / totalMid) * 100) : 0

  return (
    <div className={`rounded-xl border p-4 ${confidenceColors[source.confidence]}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-neutral-400">{iconMap[source.icon] || <DollarSign className="h-4 w-4" />}</span>
          <span className="text-sm font-medium">{source.label}</span>
          <span className={`inline-block h-2 w-2 rounded-full ${confidenceDots[source.confidence]}`} />
          <span className="text-xs text-neutral-500">
            {source.confidence === 'high' ? dict.evaluation.income.highConfidence : source.confidence === 'medium' ? dict.evaluation.income.mediumConfidence : dict.evaluation.income.lowConfidence}
          </span>
        </div>
        <div className="text-right">
          {hasIncome ? (
            <>
              <span className="text-sm font-bold tabular-nums">
                {formatUsd(source.monthlyAmount.low)} - {formatUsd(source.monthlyAmount.high)}
              </span>
              {source.percentage > 0 && (
                <span className="ml-2 text-xs text-neutral-500">{source.percentage}%</span>
              )}
            </>
          ) : (
            <span className="text-sm text-neutral-600">{dict.common.notAvailable}</span>
          )}
        </div>
      </div>

      {/* Bar */}
      <div className="h-1.5 w-full rounded-full bg-neutral-800 overflow-hidden mb-2">
        <div
          className="h-full bg-gradient-to-r from-[#FF0050] to-[#00F2EA] rounded-full transition-all"
          style={{ width: `${barWidth}%` }}
        />
      </div>

      <p className="text-xs text-neutral-500">{source.detail}</p>
    </div>
  )
}