'use client'

import { ShieldCheck, ShieldAlert } from 'lucide-react'
import { Evaluation } from '@/types'
import { formatNumber } from '@/lib/format'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

const LEVEL_COLOR: Record<string, string> = { high: '#dc2626', medium: '#b45309', low: '#6B7280' }
const SHADOWBAN_COLOR: Record<string, string> = { low: '#047857', medium: '#b45309', high: '#dc2626' }

export function RiskHealth({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const r = dict.reportV2.risk
  const risks = result.riskFlags ?? []
  const riskScore = result.valuationV2?.riskScore ?? 0
  const health = result.accountHealth
  const shadowbanColor = SHADOWBAN_COLOR[health?.shadowbanRisk ?? 'low'] ?? '#6B7280'

  return (
    <section>
      <SectionHeader index={11} title={r.title} subtitle={r.subtitle} id="risk-health" />
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

        {/* Account Health 子卡 */}
        {health && (
          <div className="mt-6 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#111827]">{r.healthTitle}</span>
              <span className="text-lg font-semibold tabular-nums text-[#111827]">
                {health.overallScore}<span className="text-sm text-[#9CA3AF]">/100</span>
              </span>
            </div>

            {/* Shadowban risk */}
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <span className="text-[13px] font-medium text-[#6B7280]">{r.shadowban}</span>
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ color: shadowbanColor, backgroundColor: `${shadowbanColor}14` }}
              >
                {r.shadowbanLevel[health.shadowbanRisk]}
              </span>
            </div>
            {health.shadowbanSignals.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {health.shadowbanSignals.map(signal => (
                  <li key={signal} className="flex gap-2 text-[13px] leading-relaxed text-[#374151]">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#b45309]" />
                    {signal}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 flex items-center gap-2 text-[13px] text-[#047857]">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                {r.noSignals}
              </p>
            )}

            {/* Fake followers + Engagement authenticity */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[13px] font-medium text-[#6B7280]">{r.fakeFollowers}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-[#111827]">
                  {formatNumber(health.fakeFollowerEstimate)}
                </p>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13px] font-medium text-[#6B7280]">{r.engagementAuthenticity}</p>
                  <p className="text-sm font-semibold tabular-nums text-[#111827]">
                    {health.engagementAuthenticity}<span className="text-xs font-normal text-[#9CA3AF]">/100</span>
                  </p>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-[#F3F4F6]">
                  <div
                    className="h-full rounded-full bg-[#1d4ed8]"
                    style={{ width: `${Math.max(0, Math.min(100, health.engagementAuthenticity))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Why */}
            {health.healthReasoning && (
              <p className="mt-4 text-[13px] leading-relaxed text-[#6B7280]">
                <span className="font-medium text-[#374151]">{r.reasoning}: </span>
                {health.healthReasoning}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
