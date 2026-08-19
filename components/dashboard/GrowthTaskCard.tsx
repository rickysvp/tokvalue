'use client'

// ── B6：Growth Plan 任务卡（Spec §9 结构）──
// title / Why this matters / Data evidence（等宽+边框强调）/ Expected impact /
// "Next review will measure: {支柱名}" 徽章 / Confidence 徽章 / Baseline calibration 标注 /
// Mark as complete（POST 后置完成态 √）。
// 风格与 components/dashboard 既有卡片一致：dark 底 / rounded-2xl / border-neutral-800，色值读 TIER_COLORS。

import { useState } from 'react'
import { Check, Gauge, Loader2, Target } from 'lucide-react'
import { TIER_COLORS } from '@/lib/tier'
import { CONFIDENCE_LABELS, withAlpha } from './shared'
import type { GrowthTask, PillarKey, TaskConfidence } from '@/types'

const PILLAR_NAMES: Record<PillarKey, string> = {
  growth_momentum: 'Growth Momentum',
  content_consistency: 'Content Consistency',
  audience_quality: 'Audience Quality',
  niche_clarity: 'Niche Clarity',
  brand_readiness: 'Brand Readiness',
  risk: 'Risk Score',
}

/** 置信度徽章底色：高置信偏青（B 组色），低置信偏警示（D 组色），均从 TIER_COLORS 派生 */
const CONFIDENCE_ACCENTS: Record<TaskConfidence, string> = {
  medium_high: TIER_COLORS.B,
  medium: TIER_COLORS.B,
  medium_low: TIER_COLORS.D,
  low: TIER_COLORS.D,
}

export function GrowthTaskCard({
  task,
  completed,
  onComplete,
}: {
  task: GrowthTask
  /** 已完成（growth_task_states 命中或刚 POST 成功） */
  completed: boolean
  /** 完成回调（页面持有 completedKeys 状态）；抛错时卡片保持未完成 */
  onComplete: (task: GrowthTask) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const accent = CONFIDENCE_ACCENTS[task.confidence]
  const measureLabel = task.measureTarget.map(k => PILLAR_NAMES[k]).join(', ')

  async function handleComplete() {
    if (completed || busy) return
    setBusy(true)
    setError(false)
    try {
      await onComplete(task)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className={`rounded-2xl border p-5 transition-colors ${
        completed
          ? 'border-[#22c55e]/30 bg-[#141414]/60'
          : 'border-neutral-800 bg-[#141414] hover:border-[#00F2EA]/20'
      }`}
      aria-label={task.title}
    >
      {/* ── 标题 + 徽章行 ── */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 className={`text-base font-bold leading-snug ${completed ? 'text-neutral-400' : 'text-white'}`}>
          {completed && <Check className="mr-1.5 inline h-4 w-4 align-[-2px] text-[#22c55e]" />}
          {task.title}
        </h3>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {task.baseline && (
            <span
              className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
              style={{ color: TIER_COLORS.S, backgroundColor: withAlpha(TIER_COLORS.S, 0.1) }}
              title="First review — this task sets the reference point"
            >
              Baseline calibration
            </span>
          )}
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold"
            style={{ color: accent, backgroundColor: withAlpha(accent, 0.1) }}
          >
            <Gauge className="h-3 w-3" />
            {CONFIDENCE_LABELS[task.confidence]}
          </span>
        </div>
      </div>

      {/* ── Why this matters ── */}
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Why this matters</p>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-300">{task.whyThisMatters}</p>
      </div>

      {/* ── Data evidence（等宽 + 边框强调）── */}
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Data evidence</p>
        <p className="mt-1.5 rounded-xl border border-neutral-800 bg-black/40 px-3.5 py-2.5 font-mono text-xs leading-relaxed text-[#00F2EA]">
          {task.evidence}
        </p>
      </div>

      {/* ── Expected impact ── */}
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Expected impact</p>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-300">{task.expectedImpact}</p>
      </div>

      {/* ── 底部：测量徽章 + 完成按钮 ── */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800/70 pt-4">
        <span
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-neutral-300"
          style={{ backgroundColor: withAlpha(TIER_COLORS.B, 0.08) }}
        >
          <Target className="h-3 w-3" style={{ color: TIER_COLORS.B }} />
          Next review will measure: {measureLabel}
        </span>

        {completed ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#22c55e]/40 bg-[#22c55e]/10 px-3 py-1.5 text-xs font-semibold text-[#22c55e]">
            <Check className="h-3.5 w-3.5" />
            Completed
          </span>
        ) : (
          <button
            onClick={handleComplete}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Mark as complete
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-[#FF0050]">Failed to mark this task complete. Please try again.</p>
      )}
    </section>
  )
}
