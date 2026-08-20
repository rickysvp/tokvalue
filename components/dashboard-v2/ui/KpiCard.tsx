import React from 'react'
import { Card } from './Card'

export function KpiCard({
  title, value, delta, deltaLabel, deltaDir, topRight
}: {
  title: string
  value: string
  delta?: string
  deltaLabel?: string
  /** 'up' = positive green, 'down' = danger red, 'neutral' = gray */
  deltaDir?: 'up' | 'down' | 'neutral'
  topRight?: React.ReactNode
}) {
  const resolvedDir: 'up' | 'down' | 'neutral' =
    deltaDir ?? (delta?.startsWith('+') ? 'up' : delta?.startsWith('-') ? 'down' : 'neutral')
  const deltaColor = resolvedDir === 'up'
    ? 'text-[#047857]'
    : resolvedDir === 'down'
      ? 'text-[#dc2626]'
      : 'text-[#6b7280]'
  const arrow = resolvedDir === 'up' ? '▲' : resolvedDir === 'down' ? '▼' : '•'
  return (
    <Card className="p-[14px] sm:p-4 relative">
      {topRight && <div className="absolute top-3 right-3 text-[11px] text-[#9ca3af]">{topRight}</div>}
      <div className="text-[11px] uppercase tracking-[0.5px] font-medium text-[#6b7280] mb-[6px]">{title.toUpperCase()}</div>
      <div className="text-[22px] font-semibold text-[#111827] tabular-nums tracking-tight leading-none">{value}</div>
      {(delta || deltaLabel) && (
        <div className="text-[11px] mt-[3px] flex items-center gap-1">
          {delta && <span className={`inline-flex items-center gap-1 ${deltaColor}`}>{arrow} {delta}</span>}
          {deltaLabel && <span className="text-[#6b7280]">{deltaLabel}</span>}
        </div>
      )}
    </Card>
  )
}
