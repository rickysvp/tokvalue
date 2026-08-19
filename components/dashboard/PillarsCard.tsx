'use client'

// ── Overview ④ 6 支柱简览（B5b，Spec §6/§7.1）──
// pillars 的 name + status（色值按状态词读 TIER_COLORS 组色，与报告页 PillarSection 一致）。
// 无 pillars 的旧报告 → 回退 dimensions 最弱 top3（含状态词），并提示重评解锁完整记分卡。

import { Layers } from 'lucide-react'
import { TIER_COLORS } from '@/lib/tier'
import { pillarStatusOf } from '@/lib/pillar'
import { STATUS_COLORS, withAlpha } from './shared'
import type { DashboardLatest } from './dashboard-data'
import type { DimensionScores, PillarStatus } from '@/types'

/** 旧报告回退：10 内部维度展示名（与 RadarChart 标签一致） */
const DIMENSION_LABELS: Record<keyof DimensionScores, string> = {
  reach: 'Reach',
  engagement: 'Engagement',
  content: 'Content',
  authenticity: 'Authenticity',
  momentum: 'Momentum',
  stability: 'Stability',
  commerce: 'Commerce',
  monetization: 'Monetization',
  health: 'Health',
  influence: 'Influence',
}

interface Row {
  key: string
  name: string
  score: number
  status: PillarStatus
}

function buildRows(latest: DashboardLatest): { rows: Row[]; legacy: boolean } {
  if (latest.pillars?.pillars?.length) {
    return {
      rows: latest.pillars.pillars.map(p => ({ key: p.key, name: p.name, score: p.score, status: p.status })),
      legacy: false,
    }
  }
  // 旧报告回退：dimensions 按分值升序取 top3（最弱三项）
  const dims = latest.dimensions
  if (dims) {
    const entries = (Object.keys(DIMENSION_LABELS) as Array<keyof DimensionScores>)
      .map(k => ({ key: k, name: DIMENSION_LABELS[k], score: dims[k] }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map(d => ({ ...d, status: pillarStatusOf(d.score) }))
    return { rows: entries, legacy: true }
  }
  return { rows: [], legacy: false }
}

export function PillarsCard({ latest }: { latest: DashboardLatest }) {
  const cyan = TIER_COLORS.B
  const { rows, legacy } = buildRows(latest)

  return (
    <section className="rounded-2xl border border-neutral-800 bg-[#141414] p-6" aria-label="Pillar overview">
      <div className="mb-4 flex items-center gap-2">
        <Layers className="h-4 w-4" style={{ color: cyan }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: cyan }}>
          {legacy ? 'Key Dimensions' : 'Six-Pillar Scorecard'}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm leading-relaxed text-neutral-400">
          Pillar breakdown unavailable for this report — update your account to unlock the six-pillar scorecard.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map(r => {
            const color = STATUS_COLORS[r.status]
            return (
              <li key={r.key}>
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-white">{r.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-black tabular-nums" style={{ color }}>{r.score}</span>
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px] font-bold"
                      style={{ color, borderColor: withAlpha(color, 0.4), backgroundColor: withAlpha(color, 0.1) }}
                    >
                      {r.status}
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${r.score}%`, backgroundColor: color }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {legacy && (
        <p className="mt-4 text-[11px] leading-relaxed text-neutral-500">
          Legacy report — showing your three weakest dimensions. Update your account to unlock the full six-pillar scorecard.
        </p>
      )}
    </section>
  )
}
