'use client'

import { ShieldCheck, ShieldAlert } from 'lucide-react'
import { Evaluation } from '@/types'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

const LEVEL_COLOR: Record<string, string> = { high: '#dc2626', medium: '#b45309', low: '#6B7280' }

export function RiskHealth({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const r = dict.reportV2.risk
  const risks = result.riskFlags ?? []
  const riskScore = result.valuationV2?.riskScore ?? 0

  return (
    <section>
      <SectionHeader index={6} title={r.title} subtitle={r.subtitle} id="risk-health" />
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[#111827]">{r.riskScore}</span>
          <span className="text-lg font-semibold tabular-nums text-[#111827]">{riskScore}<span className="text-sm text-[#9CA3AF]">/100</span></span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-[#F3F4F6]">
          <div className="h-full rounded-full bg-[#dc2626]" style={{ width: `${riskScore}%` }} />
        </div>

        {risks.length === 0 ? (
          <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-[#047857]/25 bg-[#047857]/5 px-4 py-3 text-sm text-[#047857]">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            {r.noneDetected}
          </div>
        ) : (
          <ul className="mt-5 space-y-3">
            {risks.map(flag => (
              <li key={flag.label} className="flex gap-2.5">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: LEVEL_COLOR[flag.level] }} />
                <div>
                  <p className="text-sm font-medium text-[#111827]">{flag.label}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-[#6B7280]">{flag.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
