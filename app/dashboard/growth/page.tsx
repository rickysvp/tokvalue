'use client'
import React, { useMemo } from 'react'
import { DashboardShell } from '@/components/dashboard-v2/DashboardShell'
import { ProgressHeader } from '@/components/dashboard-v2/growth/ProgressHeader'
import { WeekAccordion, type WeekTask } from '@/components/dashboard-v2/growth/WeekAccordion'
import { useDashboardData } from '@/components/dashboard/dashboard-data'

type PlanWeek = {
  focus: string
  tasks: WeekTask[]
}

const FALLBACK_WEEKS: PlanWeek[] = [
  {
    focus: 'Fix your #1 rate blocker',
    tasks: [
      { id: 'w1-t1', title: 'Review your bottleneck card & plan', subtext: 'Week 1 · Day 1', priority: 'p0', highlight: 'today' },
      { id: 'w1-t2', title: 'Make the 1 content/setting fix', subtext: 'Week 1 · Day 2-3', priority: 'p0' },
      { id: 'w1-t3', title: 'Post 2 videos applying the fix', subtext: 'Week 1 · Day 4-5', priority: 'p1' },
    ],
  },
  {
    focus: 'Build proof of performance',
    tasks: [
      { id: 'w2-t1', title: 'Capture before/after metrics screenshot', subtext: 'Week 2 · Day 1-2', priority: 'p1' },
      { id: 'w2-t2', title: 'Draft a 1-sentence results claim', subtext: 'Week 2 · Day 3', priority: 'p1' },
      { id: 'w2-t3', title: 'Post 1 proof-of-results reel or carousel', subtext: 'Week 2 · Day 4-5', priority: 'p0' },
    ],
  },
  {
    focus: 'Prepare your rate card',
    tasks: [
      { id: 'w3-t1', title: 'Open report → Price Your Next Deal tab', subtext: 'Week 3 · Day 1', priority: 'p0' },
      { id: 'w3-t2', title: 'Write down opening rate + walk-away floor', subtext: 'Week 3 · Day 2', priority: 'p0' },
      { id: 'w3-t3', title: 'Draft 3-line outreach email template', subtext: 'Week 3 · Day 3-5', priority: 'p1' },
    ],
  },
  {
    focus: 'Start pitching brands',
    tasks: [
      { id: 'w4-t1', title: 'List 10 relevant brands in your niche', subtext: 'Week 4 · Day 1-2', priority: 'p0' },
      { id: 'w4-t2', title: 'Send 3 personalized pitches', subtext: 'Week 4 · Day 3-4', priority: 'p0' },
      { id: 'w4-t3', title: 'Schedule 1 follow-up reminder', subtext: 'Week 4 · Day 5', priority: 'p1' },
    ],
  },
]

export default function DashboardGrowthPage() {
  const data = useDashboardData()
  const latest = data.latest
  const balance = data.balance

  const email = balance?.email ?? ''
  const nickname = latest?.nickname ?? email.split('@')[0] ?? 'there'
  const user = { name: nickname, email }

  const weeks: PlanWeek[] = useMemo(() => {
    const planWeeksRaw = (latest as any)?.thirtyDayPlan?.weeks
    if (Array.isArray(planWeeksRaw) && planWeeksRaw.length >= 4) {
      return planWeeksRaw.slice(0, 4).map((w: any, i: number): PlanWeek => {
        const focus = w.focus ?? w.goal ?? FALLBACK_WEEKS[i].focus
        const rawTasks = Array.isArray(w.tasks) ? w.tasks : []
        const tasks: WeekTask[] = rawTasks.length > 0
          ? rawTasks.map((t: any, idx: number): WeekTask => ({
              id: `w${i + 1}-api-${idx}`,
              title: t.title ?? t.name ?? 'Task',
              subtext: t.subtext ?? t.dayLabel ?? (t.effortHours != null ? `~${t.effortHours}h effort` : undefined),
              priority: (t.priority === 'p0' || t.priority === 'p1' || t.priority === 'p2') ? t.priority : idx === 0 ? 'p0' : idx === 1 ? 'p1' : 'p2',
              highlight: i === 0 && idx === 0 ? 'today' : undefined,
            }))
          : FALLBACK_WEEKS[i].tasks
        return { focus, tasks }
      })
    }
    return FALLBACK_WEEKS
  }, [latest])

  const firstWeekFocus = weeks[0]?.focus ?? 'Build value'

  const allTasks = useMemo(() => weeks.flatMap(w => w.tasks), [weeks])
  const total = allTasks.length
  const completed = new Set<string>()

  return (
    <DashboardShell page="growth" user={user}>
      <div className="max-w-[720px] mx-auto flex flex-col gap-4">
        <div className="mb-1">
          <h2 className="text-[22px] font-semibold text-[#111827] leading-tight">Your Growth Plan</h2>
          <p className="text-[13px] text-[#6b7280] mt-0.5">
            Week 1 of 4 · Focus: <span className="text-[#111827] font-medium">{firstWeekFocus}</span>
          </p>
        </div>

        <ProgressHeader completed={completed.size} total={total} />

        <div className="flex flex-col gap-3">
          {weeks.map((w, i) => (
            <WeekAccordion
              key={`week-${i + 1}`}
              weekNo={i + 1}
              focus={w.focus}
              tasks={w.tasks}
              completed={completed}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      </div>
    </DashboardShell>
  )
}
