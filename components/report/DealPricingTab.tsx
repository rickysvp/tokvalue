'use client'

// ── Price Your Next Deal（付费决策页）──
// Brand Deal Toolkit 的中心页：输出可谈判的报价结构，而非单一金额。
// 兼容：旧缓存无 dealPricing 时回退 brandDealPerVideo 区间展示。

import { Evaluation } from '@/types'
import { useI18n } from '@/lib/i18n'
import { formatNumber } from '@/lib/format'
import { SectionHeader } from '@/components/SectionHeader'
import { IncomeBreakdownSection } from '@/components/sections/IncomeBreakdownSection'
import { RevenueRoadmapSection } from '@/components/sections/RevenueRoadmapSection'
import { DollarSign, TrendingUp, Shield, CheckCircle2, XCircle, Info } from 'lucide-react'

interface DealPricingTabProps {
  result: Evaluation
}

export function DealPricingTab({ result }: DealPricingTabProps) {
  const { dict } = useI18n()
  const c = dict.evaluation.commercial
  const pricing = result.dealPricing

  return (
    <>
      <SectionHeader step="01" title={dict.evaluation.sections.priceYourDeal} icon={<DollarSign className="h-4 w-4" />} />

      {pricing ? (
        <>
          {/* ── 报价结构卡 ── */}
          <div className="mb-6 rounded-2xl border border-[#FF0050]/25 bg-gradient-to-br from-[#FF0050]/[0.08] via-[#0f0f0f] to-[#0f0f0f] p-6 sm:p-8">
            <div className="grid gap-6 md:grid-cols-3">
              {/* Opening rate — 主视觉 */}
              <div className="md:col-span-1">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-[#FF0050]" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#FF0050]">{c.openingRate}</span>
                </div>
                <div className="text-4xl sm:text-5xl font-black tracking-tight text-white tabular-nums">
                  ${formatNumber(pricing.openingRate)}
                </div>
                <p className="mt-2 text-xs text-neutral-500">{c.openingRateHint}</p>
              </div>
              {/* Acceptable range */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-3.5 w-3.5 text-neutral-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{c.acceptableRange}</span>
                </div>
                <div className="text-2xl font-bold text-white tabular-nums">
                  ${formatNumber(pricing.acceptableRange.low)} – ${formatNumber(pricing.acceptableRange.high)}
                </div>
                <p className="mt-2 text-xs text-neutral-500">Most deals for accounts like yours close inside this band.</p>
              </div>
              {/* Private minimum */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-3.5 w-3.5 text-neutral-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{c.privateMinimum}</span>
                </div>
                <div className="text-2xl font-bold text-[#00F2EA] tabular-nums">${formatNumber(pricing.privateMinimum)}</div>
                <p className="mt-2 text-xs text-neutral-500">{c.privateMinimumHint}</p>
              </div>
            </div>
            <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-xs text-neutral-400">
              <span className="font-semibold text-neutral-300">{c.assumesLabel}:</span> {pricing.assumptions}
            </div>
          </div>

          {/* ── 影响因素 ── */}
          <div className="mb-6 rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] to-[#141414] p-6">
            <h3 className="text-sm font-semibold text-white mb-4">{c.factorsTitle}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {pricing.factors.map((f, i) => (
                <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3.5">
                  <div className="text-xs font-semibold text-neutral-300 mb-1">{f.label}</div>
                  <div className="text-xs text-neutral-500 leading-relaxed">{f.note}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 不包含条件 ── */}
          <div className="mb-6 rounded-2xl border border-neutral-800 bg-[#0d0d0d] p-6">
            <div className="flex items-center gap-2 mb-4">
              <XCircle className="h-4 w-4 text-neutral-500" />
              <h3 className="text-sm font-semibold text-white">{c.notIncludedTitle}</h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {pricing.notIncluded.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-neutral-400">
                  <span className="h-1 w-1 rounded-full bg-neutral-600" />
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#00F2EA]/15 bg-[#00F2EA]/[0.04] px-4 py-3 text-xs text-neutral-400">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00F2EA]" />
              Quote these separately: paid usage typically adds 25–50%, exclusivity 20–40%, rush delivery 15–25%.
            </div>
          </div>
        </>
      ) : (
        /* 兼容旧缓存：回退区间展示 */
        result.brandDealPerVideo && (
          <div className="mb-6 rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] to-[#141414] p-6 sm:p-8">
            <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">{c.suggestedRate}</div>
            <div className="text-4xl font-black text-white tabular-nums">
              ${formatNumber(result.brandDealPerVideo.low)} – ${formatNumber(result.brandDealPerVideo.high)}
            </div>
            <div className="mt-2 text-sm text-neutral-400">mid ${formatNumber(result.brandDealPerVideo.mid)}</div>
          </div>
        )
      )}

      {/* ── Income Opportunities（原 Revenue 数据映射到本决策页）── */}
      <SectionHeader step="02" title={c.incomeOpportunities} icon={<DollarSign className="h-4 w-4" />} />
      <p className="mb-4 text-xs text-neutral-500">{c.incomeOpportunitiesNote}</p>
      <div className="mb-10 space-y-8">
        <IncomeBreakdownSection estimate={result.incomeEstimate} />
        <RevenueRoadmapSection roadmap={result.revenueRoadmap} />
      </div>
    </>
  )
}
