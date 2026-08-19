'use client'

// ── Six-Pillar Scorecard（Spec §7.1 新报告叙事）──
// 10 维内部引擎 → 6 支柱对外映射；点击展开每根支柱的归因说明。
// 色值按状态词读 TIER_COLORS 组色（硬约束：不硬编码色值）。

import { useState } from 'react'
import type { PillarBreakdown, PillarStatus } from '@/types'
import { TIER_COLORS } from '@/lib/tier'
import { ChevronDown } from 'lucide-react'

/** 状态词 → TIER_COLORS 组色：Strong=S/A 粉、On track=B/C 青、Needs attention=D/E 橙 */
const STATUS_COLORS: Record<PillarStatus, string> = {
  Strong: TIER_COLORS.S,
  'On track': TIER_COLORS.B,
  'Needs attention': TIER_COLORS.D,
}

const STATUS_STYLES: Record<PillarStatus, string> = {
  Strong: 'border-[#FF0050]/40 bg-[#FF0050]/10',
  'On track': 'border-[#00F2EA]/40 bg-[#00F2EA]/10',
  'Needs attention': 'border-[#f97316]/40 bg-[#f97316]/10',
}

export function PillarSection({ pillars }: { pillars: PillarBreakdown }) {
  const [openKey, setOpenKey] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      {pillars.pillars.map((p) => {
        const color = STATUS_COLORS[p.status]
        const open = openKey === p.key
        return (
          <div key={p.key} className="overflow-hidden rounded-2xl border border-neutral-800 bg-[#0d0d0d]">
            <button
              onClick={() => setOpenKey(open ? null : p.key)}
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-neutral-900/60"
              aria-expanded={open}
            >
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-white">{p.name}</span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[p.status]}`}
                    style={{ color }}
                  >
                    {p.status}
                  </span>
                  {p.key === 'risk' && (
                    <span className="text-[10px] text-neutral-500">lower is better</span>
                  )}
                </div>
                {/* 分值条 */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${p.score}%`, backgroundColor: color }}
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xl font-black tabular-nums" style={{ color }}>
                  {p.score}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`}
                />
              </div>
            </button>
            {open && (
              <div className="border-t border-neutral-800/70 bg-black/30 px-5 py-3.5">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  Why this score
                </div>
                <p className="text-sm leading-relaxed text-neutral-300">{p.attribution}</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
