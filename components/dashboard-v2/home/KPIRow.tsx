import React from 'react'
import { KpiCard } from '../ui/KpiCard'
import { Pill } from '../ui/Pill'

function fmtMoney(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${v}`
}

export function KPIRow({
  value, rank, credits, date
}: {
  value: { mid: number; deltaPct?: number; deltaLabel?: string }
  rank: { percentile: number; tierWord: string }
  credits: { remaining: number; packLabel?: string }
  date?: string
}) {
  const deltaDir = value.deltaPct == null ? undefined : value.deltaPct >= 0 ? 'up' : 'down'
  const delta = value.deltaPct == null ? undefined
    : `${value.deltaPct > 0 ? '+' : ''}${value.deltaPct.toFixed(1)}%`
  const rankPct = 100 - rank.percentile
  const rankColor =
    rank.tierWord.startsWith('Premium') ? 'tier-premium'
    : rank.tierWord.startsWith('Growth') ? 'tier-growth'
    : rank.tierWord.startsWith('Developing') ? 'tier-developing' : 'tier-early'
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <KpiCard
        title="Account Value"
        value={fmtMoney(value.mid)}
        delta={delta}
        deltaLabel={value.deltaLabel}
        deltaDir={deltaDir}
        topRight={date}
      />
      <div className="p-[14px] sm:p-4 border border-[#e5e7eb] rounded-[10px] bg-white">
        <div className="text-[11px] uppercase tracking-[0.5px] font-medium text-[#6b7280] mb-[6px]">Market Rank</div>
        <div className={`text-[22px] font-semibold tabular-nums tracking-tight leading-none ${
          rankPct <= 20 ? 'text-[#047857]' : rankPct <= 45 ? 'text-[#1d4ed8]' : rankPct <= 70 ? 'text-[#b45309]' : 'text-[#64748b]'
        }`}>Top {rankPct}%</div>
        <div className="mt-[3px]"><Pill variant={rankColor as any}>{rank.tierWord}</Pill></div>
      </div>
      <KpiCard
        title="Reviews Left"
        value={String(credits.remaining)}
        deltaLabel={credits.packLabel}
      />
    </div>
  )
}
