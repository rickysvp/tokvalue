'use client'

import Image from 'next/image'
import { BadgeCheck } from 'lucide-react'
import { Evaluation } from '@/types'
import { valueTierOf, valueTierColor } from '@/lib/pillar'
import { formatNumber } from '@/lib/format'
import { CountUp } from '../ui/CountUp'
import { MetricCell } from '../ui/MetricCell'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

const CONFIDENCE_LABEL: Record<string, string> = {
  medium_high: 'Medium-High', medium: 'Medium', medium_low: 'Medium-Low', low: 'Low',
}

export function VerdictHero({ result, dict, isPremium }: {
  result: Evaluation
  dict: EnDict
  isPremium: boolean
}) {
  const h = dict.reportV2.hero
  const range = result.valuationV2?.range
  const band = result.valuationV2?.band
  const tierName = valueTierOf(result.tier)
  const tierColor = valueTierColor(result.tier)

  return (
    <section id="verdict-hero" className="scroll-mt-24 rounded-2xl border border-[#E5E7EB] bg-white p-6 sm:p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* 账号行 */}
      <div className="flex items-center gap-4">
        {result.avatar ? (
          <Image src={result.avatar} alt={result.nickname} width={56} height={56} className="h-14 w-14 rounded-full border border-[#E5E7EB] object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F3F4F6] text-xl font-bold text-[#374151]">
            {result.nickname.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg font-semibold text-[#111827]">{result.nickname}</span>
            {result.verified && <BadgeCheck className="h-5 w-5 shrink-0" style={{ color: tierColor }} />}
          </div>
          <p className="text-sm text-[#6B7280]">@{result.username}</p>
        </div>
        <span
          className="ml-auto shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
          style={{ color: tierColor, backgroundColor: `${tierColor}14`, border: `1px solid ${tierColor}40` }}
        >
          {tierName}
        </span>
      </div>

      {/* 一句话判定 */}
      <p className="mt-6 text-lg font-medium leading-relaxed text-[#111827]">{result.summary.headline}</p>

      {/* 估值主数字 */}
      <div className="mt-6">
        {range ? (
          <div className="relative">
            <div
              className={`text-5xl sm:text-[56px] font-semibold leading-none text-[#111827] ${!isPremium ? 'blur-[6px] select-none' : ''}`}
              aria-label={isPremium ? `Estimated value $${formatNumber(range.mid)}` : 'Locked'}
            >
              {isPremium ? <CountUp target={range.mid} /> : <CountUp target={range.mid} />}
            </div>
            {!isPremium && (
              <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-[#6B7280]">
                {h.unlockExact}
              </span>
            )}
            <div className="mt-3 flex items-center gap-3 text-sm text-[#6B7280]">
              <span className="tabular-nums">${formatNumber(range.low)}</span>
              <span className="h-px flex-1 bg-[#E5E7EB]" />
              <span className="tabular-nums">${formatNumber(range.high)}</span>
              {band && (
                <span className="rounded-full border border-[#E5E7EB] bg-[#F7F8FA] px-2.5 py-0.5 text-xs text-[#374151]">
                  {h.confidence}: {CONFIDENCE_LABEL[band]}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-3xl font-semibold text-[#111827] tabular-nums">
            ${formatNumber(result.businessValue.totalValue.high)}
          </div>
        )}
      </div>

      {/* 核心指标带 */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCell label={h.metrics.followers} value={formatNumber(result.followerCount)} hint={h.hints.followers} />
        <MetricCell label={h.metrics.avgViews} value={formatNumber(result.metrics.avgPlays)} hint={h.hints.avgViews} />
        <MetricCell label={h.metrics.engagement} value={`${result.metrics.engagementRate.toFixed(1)}%`} hint={h.hints.engagement} />
        <MetricCell label={h.metrics.percentile} value={`Top ${100 - result.peerRanking.overallPercentile}%`} hint={h.hints.percentile} />
      </div>
    </section>
  )
}
