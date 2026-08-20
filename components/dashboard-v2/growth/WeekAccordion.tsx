'use client'
import React, { useState } from 'react'
import { TaskRow } from '../ui/TaskRow'
import { Pill } from '../ui/Pill'

export type WeekTask = {
  id: string
  title: string
  subtext?: string
  priority: 'p0' | 'p1' | 'p2'
  dayLabel?: string
  highlight?: 'today' | boolean
  linkArrow?: React.ReactNode
}

export function WeekAccordion({
  weekNo,
  focus,
  tasks,
  completed,
  completedLabelPrefix = 'Done',
  taskCount,
  defaultOpen = false,
  onToggleTask,
}: {
  weekNo: number
  focus: string
  tasks: WeekTask[]
  completed: Set<string>
  completedLabelPrefix?: string
  taskCount?: { done: number; total: number }
  defaultOpen?: boolean
  onToggleTask?: (taskId: string, next: boolean) => Promise<void> | void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [localDone, setLocalDone] = useState<Record<string, boolean>>({})

  const isActive = weekNo === 1

  const isDone = (id: string) => {
    if (id in localDone) return localDone[id]
    return completed.has(id)
  }

  const doneCount = taskCount?.done ?? tasks.filter((t) => isDone(t.id)).length
  const total = taskCount?.total ?? tasks.length

  const handleToggle = async (taskId: string, next: boolean) => {
    const prev = isDone(taskId)
    setLocalDone((d) => ({ ...d, [taskId]: next }))
    if (onToggleTask) {
      try {
        await onToggleTask(taskId, next)
      } catch {
        setLocalDone((d) => ({ ...d, [taskId]: prev }))
      }
    }
  }

  const weekPillClass = isActive
    ? 'bg-[#1d4ed810] text-[#1d4ed8]'
    : 'bg-white border border-[#e5e7eb] text-[#6b7280]'

  const headerBg = open ? 'bg-[#fafafa] border-b border-[#e5e7eb]' : ''

  return (
    <div className="border border-[#e5e7eb] rounded-[10px] overflow-hidden bg-white">
      <button
        role="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${headerBg}`}
      >
        <span
          className={`inline-flex items-center text-[10px] sm:text-[11px] font-semibold px-2 sm:px-2.5 py-1 rounded-full ${weekPillClass}`}
        >
          WEEK {weekNo}
        </span>
        <div className="flex-1 min-w-0 text-[14px] font-medium text-[#111827] truncate">
          {focus}
        </div>
        <Pill variant="muted">
          {doneCount}/{total}
        </Pill>
        <span className="text-[16px] text-[#6b7280] w-5 h-5 flex items-center justify-center flex-shrink-0">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 p-3 sm:p-4">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              title={task.title}
              subtext={task.subtext}
              priority={task.priority}
              checked={isDone(task.id)}
              onToggle={(next) => handleToggle(task.id, next)}
              linkArrow={task.linkArrow}
              highlight={task.highlight}
            />
          ))}
        </div>
      )}
    </div>
  )
}
