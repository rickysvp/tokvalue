import React from 'react'
import { Card } from '../ui/Card'

export type HistoryNode = {
  dateLabel: string
  valueLabel: string
  tier?: string
  isCurrent?: boolean
}

export function ProgressStrip({ history }: { history: HistoryNode[] }) {
  if (!history || history.length < 2) return null
  const last = history[history.length - 2]
  const current = history[history.length - 1]
  return (
    <Card className="p-[14px] sm:p-4">
      <div className="text-[12px] font-semibold text-[#111827] mb-3">Progress over time</div>
      <div className="flex gap-2.5 items-stretch">
        <NodeCard title={last.dateLabel} value={last.valueLabel} tier={last.tier} variant="past" />
        <NodeCard title={current.dateLabel} value={current.valueLabel} tier={current.tier} variant="current" />
        <NodeCard title="Next" value="" variant="placeholder" />
      </div>
    </Card>
  )
}

function NodeCard({
  title, value, tier, variant
}: {
  title: string
  value: string
  tier?: string
  variant: 'past' | 'current' | 'placeholder'
}) {
  const base = 'flex-1 text-center py-2 px-1.5 rounded-lg border text-[12px]'
  const cls = variant === 'current'
    ? 'border-[#1d4ed8] bg-[#1d4ed805]'
    : variant === 'past'
      ? 'border-[#e5e7eb] bg-[#fafafa]'
      : 'border-dashed border-[#e5e7eb] bg-white text-[#d1d5db]'
  return (
    <div className={`${base} ${cls}`}>
      <div className={`text-[10px] mb-1 ${variant === 'current' ? 'text-[#1d4ed8] font-semibold' : variant === 'placeholder' ? '' : 'text-[#6b7280]'}`}>{title}</div>
      <div className={`text-[15px] font-semibold tabular-nums ${variant === 'placeholder' ? '' : 'text-[#111827]'}`}>{value}</div>
      {tier && <div className={`text-[10px] mt-0.5 ${variant === 'current' ? 'text-[#047857]' : 'text-[#6b7280]'}`}>{tier}</div>}
    </div>
  )
}
