'use client'

// ── Raise Your Value in 30 Days（付费决策页）──
// 将 Growth Plan / Content Strategy / Commerce 结论压缩为四周任务清单。
// 每项任务：本周目标 + 具体动作 + 影响的商业因素 + 完成证据 + 预计投入。
// 兼容：旧缓存无 thirtyDayPlan 时回退 GrowthPlanSection。

import { Evaluation } from '@/types'
import { useI18n } from '@/lib/i18n'
import { SectionHeader } from '@/components/SectionHeader'
import { GrowthPlanSection } from '@/components/sections/GrowthPlanSection'
import { ContentStrategySection } from '@/components/sections/ContentStrategySection'
import { TrendingUp, Flag, CheckCircle2, Clock, CircleDot } from 'lucide-react'

interface ThirtyDayPlanTabProps {
  result: Evaluation
}

const WEEK_ACCENTS = [
  'from-[#FF0050]/15 border-[#FF0050]/25',
  'from-[#00F2EA]/10 border-[#00F2EA]/25',
  'from-amber-500/10 border-amber-500/25',
  'from-green-500/10 border-green-500/25',
]

export function ThirtyDayPlanTab({ result }: ThirtyDayPlanTabProps) {
  const { dict } = useI18n()
  const c = dict.evaluation.commercial
  const plan = result.thirtyDayPlan

  return (
    <>
      <SectionHeader step="01" title={dict.evaluation.sections.thirtyDayPlan} icon={<TrendingUp className="h-4 w-4" />} />

      {plan ? (
        <>
          {/* 计划生成依据 */}
          <div className="mb-6 rounded-2xl border border-neutral-800 bg-[#0d0d0d] p-5">
            <div className="flex items-start gap-3">
              <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">{c.planSummaryLabel}</div>
                <p className="text-sm text-neutral-400 leading-relaxed">{plan.summary}</p>
              </div>
            </div>
          </div>

          {/* 四周任务时间线 */}
          <div className="relative mb-10 space-y-4">
            <div className="absolute left-[27px] top-8 bottom-8 w-px bg-gradient-to-b from-[#FF0050]/40 via-neutral-700 to-green-500/40" aria-hidden />
            {plan.tasks.map((task, i) => (
              <div key={i} className={`relative flex gap-4 rounded-2xl border bg-gradient-to-br to-transparent p-5 sm:p-6 ${WEEK_ACCENTS[i % 4]}`}>
                <div className="z-10 flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-neutral-700 bg-[#141414]">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">{c.weekLabel.replace('{n}', '')}</span>
                  <span className="text-lg font-black leading-none text-white">{task.week}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-bold text-white">{task.goal}</h4>
                    <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400">
                      <Clock className="h-3 w-3" />~{task.effortHours}h
                    </span>
                  </div>
                  <ul className="mb-3 space-y-1.5">
                    {task.actions.map((a, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-neutral-300 leading-relaxed">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-neutral-500" />
                        {a}
                      </li>
                    ))}
                  </ul>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-0.5">{c.impactsLabel}</div>
                      <div className="text-xs text-neutral-400 leading-relaxed">{task.impacts}</div>
                    </div>
                    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2">
                      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-0.5">
                        <Flag className="h-2.5 w-2.5" />{c.doneWhenLabel}
                      </div>
                      <div className="flex items-start gap-1.5 text-xs text-neutral-400 leading-relaxed">
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-[#00F2EA]" />
                        {task.doneWhen}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* 兼容旧缓存：回退原 Growth Plan */
        <div className="mb-10">
          <GrowthPlanSection plan={result.growthPlan} />
        </div>
      )}

      {/* 辅助：Content Strategy（内容支柱支撑周任务执行） */}
      <SectionHeader step="02" title={dict.evaluation.sections.contentStrategy} icon={<CircleDot className="h-4 w-4" />} />
      <div className="mb-10">
        <ContentStrategySection strategy={result.contentStrategy} />
      </div>

      {/* 辅助：Growth Plan（完整优先级清单，与 30 天计划互补） */}
      <SectionHeader step="03" title="Growth Actions" icon={<TrendingUp className="h-4 w-4" />} />
      <div className="mb-10">
        <GrowthPlanSection plan={result.growthPlan} />
      </div>
    </>
  )
}
