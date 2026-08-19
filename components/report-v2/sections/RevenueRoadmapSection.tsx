'use client'

import { ArrowRight } from 'lucide-react'
import { Evaluation } from '@/types'
import { formatNumber } from '@/lib/format'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

export function RevenueRoadmapSection({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const t = dict.reportV2.roadmap
  const roadmap = result.revenueRoadmap
  if (!roadmap?.projections?.length) return null

  return (
    <section>
      <SectionHeader index={7} title={t.title} subtitle={t.subtitle} id="revenue-roadmap" />
      {/* Now → 12-month potential */}
      <div className="grid grid-cols-[1fr,auto,1fr] items-stretch gap-3">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[13px] text-[#6B7280]">{t.current}</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-[#111827]">
            ${formatNumber(roadmap.currentMonthly.mid)}
            <span className="ml-1 text-sm font-normal text-[#6B7280]">/mo</span>
          </p>
        </div>
        <div className="flex items-center">
          <ArrowRight className="h-5 w-5 text-[#9CA3AF]" />
        </div>
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[13px] text-[#6B7280]">{t.total12}</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-[#047857]">
            ${formatNumber(roadmap.total12Month.mid)}
          </p>
        </div>
      </div>

      {/* 竖向里程碑时间线 */}
      <div className="relative mt-6 space-y-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-[#E5E7EB]">
        {roadmap.projections.map(m => (
          <div key={m.month} className="relative pl-8">
            <span className="absolute left-0 top-1.5 flex h-[15px] w-[15px] items-center justify-center rounded-full border-2 border-[#1d4ed8] bg-white" />
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-[#1d4ed8]">{t.month} {m.month}</span>
                <span className="text-sm font-semibold tabular-nums text-[#111827]">
                  ${formatNumber(m.revenue.low)}–${formatNumber(m.revenue.high)}
                  <span className="ml-1 text-xs font-normal text-[#6B7280]">/mo</span>
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-[#111827]">{m.label}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-[#374151]">{m.milestone}</p>
              {m.unlocks.length > 0 && (
                <div className="mt-3 border-t border-[#E5E7EB] pt-2.5">
                  <p className="text-xs font-medium text-[#6B7280]">{t.unlocks}</p>
                  <ul className="mt-1.5 space-y-1.5">
                    {m.unlocks.map(u => (
                      <li key={u} className="text-[13px] leading-relaxed text-[#374151]">
                        <span className="mr-1.5 font-semibold text-[#047857]">✓</span>
                        {u}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
