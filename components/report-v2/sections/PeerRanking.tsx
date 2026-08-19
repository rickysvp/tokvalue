'use client'

import { Evaluation } from '@/types'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

export function PeerRanking({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const p = dict.reportV2.peer
  const rows = result.peerRanking.rankingBreakdown
  return (
    <section>
      <SectionHeader index={8} title={p.title} subtitle={p.subtitle} id="peer-ranking" />
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="space-y-5">
          {rows.map(row => (
            <div key={row.metric}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-[#111827]">{row.metric}</span>
                <span className="text-sm font-semibold tabular-nums text-[#1d4ed8]">{row.value}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-[#F3F4F6]">
                <div className="h-full rounded-full bg-[#1d4ed8]" style={{ width: `${row.percentile}%` }} />
              </div>
              <p className="mt-1 text-xs text-[#6B7280]">Top {100 - row.percentile}% of peers</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-4 py-3 text-[13px] leading-relaxed text-[#374151]">
          <span className="font-medium">{p.insight}: </span>{result.peerRanking.insight}
        </div>
      </div>
    </section>
  )
}
