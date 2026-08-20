import React from 'react'
import { Checkbox } from './Checkbox'
import { Pill } from './Pill'

type Priority = 'p0' | 'p1' | 'p2'
export function TaskRow({
  title, subtext, priority, checked, onToggle,
  linkArrow, actions, highlight
}: {
  title: string
  subtext?: string
  priority: Priority
  checked: boolean
  onToggle?: (next: boolean) => void
  linkArrow?: React.ReactNode
  actions?: React.ReactNode
  highlight?: 'today' | boolean
}) {
  const line = checked ? 'line-through opacity-50' : ''
  const hl = highlight === 'today' || highlight === true
    ? 'bg-[#1d4ed805] border-[#1d4ed820]'
    : 'border-[#e5e7eb] bg-white'
  return (
    <div className={`flex items-start gap-3 p-[14px] sm:px-4 sm:py-[14px] border rounded-[10px] transition ${hl}`}>
      <Checkbox checked={checked} onChange={onToggle} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <div className={`text-[14px] font-medium text-[#111827] leading-snug ${line}`} style={checked ? { textDecoration: 'line-through' } : undefined}>{title}</div>
          <Pill variant={priority}>
            {priority === 'p0' ? 'P0' : priority === 'p1' ? 'P1' : 'P2'}
          </Pill>
        </div>
        {subtext && (
          <div className={`text-[12px] text-[#6b7280] ${checked ? 'opacity-60' : ''}`} style={checked ? { textDecoration: 'line-through' } : undefined}>{subtext}</div>
        )}
        {actions && <div className="mt-2 flex flex-wrap gap-1.5">{actions}</div>}
      </div>
      {linkArrow && <div className="text-[11px] text-[#1d4ed8] font-medium self-center flex-shrink-0">{linkArrow}</div>}
    </div>
  )
}
