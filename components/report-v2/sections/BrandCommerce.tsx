'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Evaluation } from '@/types'
import { formatNumber } from '@/lib/format'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

const TIER_COLOR: Record<string, string> = {
  'Commerce-Ready': '#047857',
  'Emerging': '#b45309',
  'Limited': '#6B7280',
}

const FIT_COLOR: Record<string, string> = {
  high: '#047857',
  medium: '#1d4ed8',
  low: '#6B7280',
}

/** fitScore(0–100) → high / medium / low 三档 */
function fitOf(score: number): 'high' | 'medium' | 'low' {
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

export function BrandCommerce({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const b = dict.reportV2.brand
  const [showProducts, setShowProducts] = useState(false)

  const readiness = result.commerceReadiness
  const matches = result.brandMatching?.matches ?? []
  const products = readiness?.productMatches ?? []
  const channels = readiness?.channels ?? []

  if (!readiness && matches.length === 0) return null

  return (
    <section>
      <SectionHeader index={10} title={b.title} subtitle={b.subtitle} id="brand-commerce" />
      <div className="space-y-4">
        {/* Commerce readiness 卡 */}
        {readiness && (
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-[13px] font-medium text-[#6B7280]">{b.readiness}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-3">
              <p className="text-3xl font-semibold tabular-nums leading-none text-[#111827] sm:text-4xl">
                {readiness.overallScore}
                <span className="ml-1 text-sm font-normal text-[#9CA3AF]">/100</span>
              </p>
              {readiness.tier && (
                <span
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={{
                    color: TIER_COLOR[readiness.tier] ?? '#6B7280',
                    backgroundColor: `${TIER_COLOR[readiness.tier] ?? '#6B7280'}14`,
                  }}
                >
                  {readiness.tier}
                </span>
              )}
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-[#374151]">{readiness.summary}</p>
            {readiness.recommendation && (
              <div className="mt-4 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-4 py-3 text-[13px] leading-relaxed text-[#374151]">
                <span className="font-medium">{b.recommendation}: </span>
                {readiness.recommendation}
              </div>
            )}
          </div>
        )}

        {/* Matched brands 列表 */}
        {matches.length > 0 && (
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-[13px] font-medium text-[#6B7280]">{b.matchedBrands}</p>
            <ul className="mt-3 space-y-4">
              {matches.map(match => (
                <li key={match.category}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-[#111827]">{match.category}</span>
                    <span className="text-sm font-semibold tabular-nums text-[#111827]">
                      ${formatNumber(match.estimatedDealRange.low)}–${formatNumber(match.estimatedDealRange.high)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-[#F3F4F6]">
                    <div
                      className="h-full rounded-full bg-[#1d4ed8]"
                      style={{ width: `${Math.max(0, Math.min(100, match.fitScore))}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[#6B7280]">{match.reasoning}</p>
                  {match.exampleBrands?.length > 0 && (
                    <p className="mt-1 text-xs text-[#9CA3AF]">
                      {b.exampleBrands}: {match.exampleBrands.join(' · ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Channel fit */}
        {channels.length > 0 && (
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-[13px] font-medium text-[#6B7280]">{b.channels}</p>
            <ul className="mt-3 space-y-4">
              {channels.map(channel => {
                const fit = fitOf(channel.fitScore)
                const color = FIT_COLOR[fit]
                return (
                  <li key={channel.source}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-[#111827]">{channel.label}</span>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ color, backgroundColor: `${color}14` }}
                        >
                          {b.fit[fit]}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-[#111827]">
                          {channel.fitScore}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-[#F3F4F6]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(0, Math.min(100, channel.fitScore))}%`, backgroundColor: color }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Product matches 折叠区 */}
        {products.length > 0 && (
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <button
              type="button"
              onClick={() => setShowProducts(s => !s)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1d4ed8] hover:underline"
            >
              {b.products}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showProducts ? 'rotate-180' : ''}`}
              />
            </button>
            {showProducts && (
              <ul className="mt-4 space-y-4 border-t border-[#E5E7EB] pt-4">
                {products.map(product => (
                  <li key={product.category}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-[#111827]">{product.category}</span>
                      <span className="text-sm font-semibold tabular-nums text-[#111827]">
                        ${formatNumber(product.avgOrderValue)}
                        <span className="ml-1 text-xs font-normal text-[#6B7280]">{b.avgOrder}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-[#F3F4F6]">
                      <div
                        className="h-full rounded-full bg-[#1d4ed8]"
                        style={{ width: `${Math.max(0, Math.min(100, product.fitScore))}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-[#6B7280]">{product.reasoning}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
