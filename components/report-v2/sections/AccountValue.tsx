'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Evaluation } from '@/types'
import { formatNumber } from '@/lib/format'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

export function AccountValue({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const v = dict.reportV2.value
  const [showHow, setShowHow] = useState(false)
  const range = result.valuationV2?.range
  const discount = result.valuationV2?.riskDiscountPct ?? 0
  const components = result.businessValue.components
  const maxComp = Math.max(...components.map(c => c.amount.mid), 1)

  return (
    <section>
      <SectionHeader index={2} title={v.title} subtitle={v.subtitle} id="account-value" />
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {/* 温度计区间条 */}
        {range && (
          <div>
            <div className="relative h-2.5 rounded-full bg-[#F3F4F6]">
              <div className="absolute inset-y-0 left-[15%] right-[15%] rounded-full bg-[#1d4ed8]/15" />
              <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#1d4ed8] shadow" />
            </div>
            <div className="mt-2.5 flex justify-between text-sm">
              <span className="tabular-nums text-[#6B7280]">${formatNumber(range.low)}</span>
              <span className="font-semibold tabular-nums text-[#111827]">${formatNumber(range.mid)}</span>
              <span className="tabular-nums text-[#6B7280]">${formatNumber(range.high)}</span>
            </div>
          </div>
        )}

        {/* 四分项 */}
        <div className="mt-6 space-y-4">
          <p className="text-[13px] font-medium text-[#6B7280]">{v.components}</p>
          {components.map(c => (
            <div key={c.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-[#111827]">{c.label}</span>
                <span className="text-sm font-semibold tabular-nums text-[#111827]">${formatNumber(c.amount.mid)}</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-[#F3F4F6]">
                <div className="h-full rounded-full bg-[#1d4ed8]" style={{ width: `${(c.amount.mid / maxComp) * 100}%` }} />
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#6B7280]">{c.detail}</p>
            </div>
          ))}
        </div>

        {/* 风险折扣 */}
        {discount > 0 && (
          <div className="mt-6 rounded-xl border border-[#b45309]/25 bg-[#b45309]/5 px-4 py-3 text-sm text-[#92400E]">
            {v.riskAdjustment}: −{discount}%
          </div>
        )}

        {/* 怎么算的 */}
        <button
          type="button"
          onClick={() => setShowHow(s => !s)}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[#1d4ed8] hover:underline"
        >
          {v.howEstimated}
          <ChevronDown className={`h-4 w-4 transition-transform ${showHow ? 'rotate-180' : ''}`} />
        </button>
        {showHow && (
          <div className="mt-3 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] p-4 text-[13px] leading-relaxed text-[#374151]">
            Estimates combine your recent video views, engagement quality, follower base and niche
            market rates. Confidence reflects sample size and data coverage; the range widens when
            signals are mixed. All figures are estimates, not offers.
          </div>
        )}
      </div>
    </section>
  )
}
