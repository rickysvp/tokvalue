'use client'

// ── Overview ② 本周核心问题 + 最多 3 任务（B5b，Spec §6）──
// 核心问题：最弱支柱名 + 状态词；commercialSnapshot.primaryRateBlocker 一句话（服务端 hydrate）。
// 任务：最弱 3 支柱作为本周焦点（Risk 支柱反向语义换算后取最弱）；CTA 链到 Growth Plan。
// 无 pillars 的旧报告：仅显示 rate blocker（若有）+ CTA。

import Link from 'next/link'
import { Target, ShieldAlert, ArrowRight } from 'lucide-react'
import { TIER_COLORS } from '@/lib/tier'
import { STATUS_COLORS, withAlpha } from './shared'
import type { DashboardLatest } from './dashboard-data'
import type { Pillar } from '@/types'

/** Risk 支柱反向语义：低风险 = Strong → 弱度按 100 - score 换算 */
function weaknessOf(p: Pillar): number {
  return p.key === 'risk' ? 100 - p.score : p.score
}

export function FocusCard({ latest }: { latest: DashboardLatest }) {
  const cyan = TIER_COLORS.B
  const pillars = latest.pillars?.pillars ?? null
  const sorted = pillars ? [...pillars].sort((a, b) => weaknessOf(a) - weaknessOf(b)) : []
  const weakest = sorted[0] ?? null
  const focusTasks = sorted.slice(0, 3)
  const blocker = latest.primaryRateBlocker

  return (
    <section className="rounded-2xl border border-neutral-800 bg-[#141414] p-6" aria-label="This week's focus">
      <div className="mb-4 flex items-center gap-2">
        <Target className="h-4 w-4" style={{ color: TIER_COLORS.S }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: TIER_COLORS.S }}>
          This Week&apos;s Focus
        </span>
      </div>

      {/* ── 核心问题 ── */}
      <div className="rounded-xl border border-neutral-800 bg-black/30 p-4">
        {weakest ? (
          <p className="text-sm leading-relaxed text-neutral-300">
            Weakest pillar:{' '}
            <span className="font-bold text-white">{weakest.name}</span>{' '}
            <span className="font-semibold" style={{ color: STATUS_COLORS[weakest.status] }}>({weakest.status})</span>
          </p>
        ) : (
          <p className="text-sm text-neutral-400">
            Pillar breakdown unavailable for this report — update your account to unlock it.
          </p>
        )}
        {blocker ? (
          <p className="mt-2 text-sm leading-relaxed text-neutral-300">
            Biggest rate blocker:{' '}
            <span className="font-semibold text-white">{blocker.label}</span>
            <span className="text-neutral-500"> — {blocker.detail}</span>
          </p>
        ) : !weakest ? (
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-neutral-500">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Commercial snapshot will be available after your next update.
          </p>
        ) : null}
      </div>

      {/* ── 最多 3 任务（最弱支柱 = 本周焦点）── */}
      {focusTasks.length > 0 && (
        <ul className="mt-4 space-y-2.5">
          {focusTasks.map((p, i) => (
            <li key={p.key} className="flex items-start gap-3 rounded-xl border border-neutral-800/70 bg-black/20 px-3.5 py-2.5">
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black"
                style={{ color: STATUS_COLORS[p.status], backgroundColor: withAlpha(STATUS_COLORS[p.status], 0.12) }}
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">
                  {p.name}{' '}
                  <span className="text-xs font-semibold" style={{ color: STATUS_COLORS[p.status] }}>
                    · {p.status}
                  </span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-neutral-500">{p.attribution}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={`/dashboard/growth-plan?username=${encodeURIComponent(latest.username)}`}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ color: cyan }}
      >
        Open your Growth Plan
        <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  )
}
