'use client'

import { Evaluation } from '@/types'
import { formatNumber } from '@/lib/format'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

export function DealPricing({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const d = dict.reportV2.deal
  const deal = result.dealPricing
  if (!deal) return null

  const cards = [
    { label: d.opening, value: deal.openingRate, accent: '#047857' },
    { label: d.fairRange, value: null, range: deal.acceptableRange, accent: '#1d4ed8' },
    { label: d.floor, value: deal.privateMinimum, accent: '#b45309' },
  ]

  return (
    <section>
      <SectionHeader index={4} title={d.title} subtitle={d.subtitle} id="deal-pricing" />
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map(c => (
          <div key={c.label} className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-[13px] text-[#6B7280]">{c.label}</p>
            {c.value !== null ? (
              <p className="mt-1.5 text-2xl font-semibold tabular-nums text-[#111827]">${formatNumber(c.value)}</p>
            ) : c.range ? (
              <p className="mt-1.5 text-2xl font-semibold tabular-nums text-[#111827]">
                ${formatNumber(c.range.low)}–${formatNumber(c.range.high)}
              </p>
            ) : null}
            <div className="mt-2 h-1 w-10 rounded-full" style={{ backgroundColor: c.accent }} />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <p className="text-sm font-semibold text-[#111827]">{d.assumptions}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-[#6B7280]">{deal.assumptions}</p>
          <p className="mt-4 text-sm font-semibold text-[#111827]">{d.notIncluded}</p>
          <ul className="mt-2 space-y-1">
            {deal.notIncluded.map(item => (
              <li key={item} className="text-[13px] text-[#6B7280]">— {item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <p className="text-sm font-semibold text-[#111827]">{d.factors}</p>
          <ul className="mt-2 space-y-2.5">
            {deal.factors.map(f => (
              <li key={f.label} className="text-[13px] leading-relaxed text-[#374151]">
                <span className="font-medium">{f.label}:</span> {f.note}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
