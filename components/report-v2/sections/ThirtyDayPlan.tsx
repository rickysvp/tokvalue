'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Evaluation } from '@/types'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

export function ThirtyDayPlan({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const p = dict.reportV2.plan
  const plan = result.thirtyDayPlan
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`tv_plan:${result.username}`)
      if (raw) setChecked(JSON.parse(raw))
    } catch {}
  }, [result.username])

  const toggle = (key: string) => {
    setChecked(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem(`tv_plan:${result.username}`, JSON.stringify(next)) } catch {}
      return next
    })
  }

  if (!plan?.tasks?.length) return null

  return (
    <section>
      <SectionHeader index={12} title={p.title} subtitle={p.subtitle} id="thirty-day-plan" />
      <div className="relative space-y-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-[#E5E7EB]">
        {plan.tasks.map(task => (
          <div key={task.week} className="relative pl-8">
            <span className="absolute left-0 top-1.5 flex h-[15px] w-[15px] items-center justify-center rounded-full border-2 border-[#1d4ed8] bg-white" />
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-[#1d4ed8]">{p.week} {task.week}</span>
                <span className="text-xs text-[#6B7280]">{task.effortHours} {p.effort}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-[#111827]">{task.goal}</p>
              <ul className="mt-3 space-y-2">
                {task.actions.map((action, i) => {
                  const key = `${task.week}-${i}`
                  const done = !!checked[key]
                  return (
                    <li key={key}>
                      <button type="button" onClick={() => toggle(key)} className="flex w-full items-start gap-2.5 text-left">
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${done ? 'border-[#047857] bg-[#047857]' : 'border-[#D1D5DB] bg-white'}`}>
                          {done && <Check className="h-3 w-3 text-white" />}
                        </span>
                        <span className={`text-[13px] leading-relaxed ${done ? 'text-[#9CA3AF] line-through' : 'text-[#374151]'}`}>{action}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-3 border-t border-[#E5E7EB] pt-2.5 text-xs text-[#6B7280]">{p.doneWhen}: {task.doneWhen}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
