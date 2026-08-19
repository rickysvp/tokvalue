'use client'

import { Evaluation } from '@/types'
import { formatNumber } from '@/lib/format'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

const CONFIDENCE_COLOR: Record<string, string> = {
  high: '#15803d',
  medium: '#1d4ed8',
  low: '#6B7280',
}

export function IncomeOpportunities({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const t = dict.reportV2.income
  const income = result.incomeEstimate
  if (!income?.breakdown?.length) return null

  return (
    <section>
      <SectionHeader index={5} title={t.title} subtitle={t.subtitle} id="income" />
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {/* 月度总额 */}
        <p className="text-[13px] font-medium text-[#6B7280]">{t.monthlyTotal}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-3">
          <p className="text-3xl font-semibold tabular-nums leading-none text-[#111827] sm:text-4xl">
            ${formatNumber(income.monthlyTotal.low)}–${formatNumber(income.monthlyTotal.high)}
            <span className="ml-1.5 text-sm font-normal text-[#6B7280]">/mo</span>
          </p>
          <span className="rounded-full border border-[#E5E7EB] bg-[#F7F8FA] px-2.5 py-0.5 text-xs text-[#374151]">
            {t.niche}: {income.categoryLabel}
          </span>
          <span className="rounded-full border border-[#E5E7EB] bg-[#F7F8FA] px-2.5 py-0.5 text-xs text-[#374151]">
            {t.region}: {income.regionLabel}
          </span>
        </div>

        {/* 渠道列表 */}
        <div className="mt-6 space-y-4 border-t border-[#E5E7EB] pt-6">
          {income.breakdown.map(item => {
            const color = CONFIDENCE_COLOR[item.confidence] ?? '#6B7280'
            return (
              <div key={item.source}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-[#111827]">{item.label}</span>
                  <span className="text-sm font-semibold tabular-nums text-[#111827]">
                    ${formatNumber(item.monthlyAmount.mid)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-[#F3F4F6]">
                  <div
                    className="h-full rounded-full bg-[#1d4ed8]"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ color, backgroundColor: `${color}14` }}
                  >
                    {t.confidence[item.confidence]}
                  </span>
                  <p className="truncate text-[13px] text-[#6B7280]">{item.detail}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
