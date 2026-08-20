'use client'
import Link from 'next/link'
import React, { useMemo, useState } from 'react'
import { TaskRow } from '../ui/TaskRow'

type Prio = 'p0' | 'p1' | 'p2'
export type TaskAction =
  | { type: 'copy'; label: string; text: string }
  | { type: 'link'; label: string; href: string }
  | { type: 'button'; label: string; onClick: () => void }

export type DashboardTask = {
  id: string
  title: string
  subtext?: string
  priority: Prio
  highlight?: 'today' | boolean
  linkArrow?: string
  actions?: TaskAction[]
  tomorrow?: boolean
}

export function TodayTasks({
  tasks, tomorrow = [], onToggle, onComplete, onCompleteFail
}: {
  tasks: DashboardTask[]
  tomorrow?: DashboardTask[]
  onToggle?: (id: string, next: boolean) => Promise<any>
  onComplete?: (id: string) => Promise<any>
  onCompleteFail?: (err: any) => void
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [tomorrowOpen, setTomorrowOpen] = useState(false)

  const toggle = async (t: DashboardTask) => {
    const next = !checked[t.id]
    setChecked(s => ({ ...s, [t.id]: next }))
    try {
      if (onToggle) await onToggle(t.id, next)
      else if (next && onComplete) await onComplete(t.id)
    } catch (e) {
      setChecked(s => ({ ...s, [t.id]: !next }))
      onCompleteFail?.(e)
    }
  }

  const sorted = useMemo(() => [...tasks].sort((a, b) => {
    const rank: Record<Prio, number> = { p0: 0, p1: 1, p2: 2 }
    return rank[a.priority] - rank[b.priority]
  }), [tasks])

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2.5">
        <div className="text-[11px] text-[#6b7280] uppercase tracking-[1px] font-semibold">
          Today · {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
        <Link href="/dashboard/growth" className="text-[12px] text-[#1d4ed8] hover:underline">
          View full plan →
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {sorted.map(t => (
          <TaskRow key={t.id}
            title={t.title}
            subtext={t.subtext}
            priority={t.priority}
            checked={!!checked[t.id]}
            onToggle={() => toggle(t)}
            linkArrow={t.linkArrow}
            highlight={t.highlight}
            actions={t.actions?.map(a => {
              if (a.type === 'copy') {
                const active = copied === t.id + a.label
                return (
                  <button key={a.label}
                    onClick={async () => {
                      await navigator.clipboard.writeText(a.text)
                      setCopied(t.id + a.label)
                      setTimeout(() => setCopied(null), 1500)
                    }}
                    className="text-[11px] px-2.5 py-1 border border-[#e5e7eb] bg-[#f9fafb] text-[#111827] rounded hover:bg-gray-100"
                  >{active ? 'Copied ✓' : a.label}</button>
                )
              }
              if (a.type === 'link') {
                return <Link key={a.label} href={a.href} target={a.href.startsWith('http') ? '_blank' : undefined} rel="noopener"
                  className="text-[11px] px-2.5 py-1 border border-[#e5e7eb] bg-[#f9fafb] text-[#111827] rounded hover:bg-gray-100 inline-flex items-center">{a.label}</Link>
              }
              return <button key={a.label} onClick={a.onClick}
                className="text-[11px] px-2.5 py-1 border border-[#e5e7eb] bg-[#f9fafb] text-[#111827] rounded">{a.label}</button>
            })}
          />
        ))}
      </div>

      {tomorrow.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-dashed border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            <div className="text-[12px] text-[#6b7280] font-medium">Tomorrow · {tomorrow.length} tasks</div>
            <button onClick={() => setTomorrowOpen(o => !o)} className="text-[11px] text-[#1d4ed8] hover:underline">
              {tomorrowOpen ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {tomorrowOpen && (
            <div className="flex flex-col gap-2 mt-2">
              {tomorrow.map(t => (
                <TaskRow key={t.id}
                  title={t.title}
                  subtext={t.subtext}
                  priority={t.priority}
                  checked={!!checked[t.id]}
                  onToggle={() => toggle(t)}
                  linkArrow={t.linkArrow}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
