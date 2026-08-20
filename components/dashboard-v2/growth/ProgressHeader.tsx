import React from 'react'
import { Card } from '../ui/Card'

export function ProgressHeader({ completed, total }: { completed: number; total: number }) {
  const pct = Math.round((completed / Math.max(1, total)) * 100)
  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[12px] text-[#6b7280]">Overall completion</div>
        <div className="text-[12px] font-semibold text-[#047857] tabular-nums">
          {completed} / {total} done · {pct}%
        </div>
      </div>
      <div className="w-full h-2 bg-[#f3f4f6] rounded-full overflow-hidden">
        <div
          data-bar-fill
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg,#1d4ed8,#047857)',
          }}
        />
      </div>
    </Card>
  )
}
