import Link from 'next/link'
import React from 'react'
import { Card } from '../ui/Card'

type Status = 'strong' | 'on-track' | 'needs-attention' | 'early'

export function PillarScorecard({
  pillars, reportHref, username
}: {
  pillars: { name: string; score: number; status: Status }[]
  reportHref?: string
  username: string
}) {
  if (!pillars || pillars.length < 6) return null
  const colorOf = (s: Status, sc: number) => {
    if (s === 'strong' || sc >= 75) return '#047857'
    if (s === 'on-track' || sc >= 55) return '#1d4ed8'
    if (s === 'needs-attention') return '#b45309'
    return '#64748b'
  }
  return (
    <Card className="p-[14px] sm:p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[12px] font-semibold text-[#111827]">Six-pillar scorecard</div>
        {reportHref && (
          <Link
            href={reportHref.startsWith('http') ? reportHref : `/evaluate/${encodeURIComponent(username)}${reportHref}`}
            className="text-[11px] text-[#1d4ed8] hover:underline"
          >
            Full report →
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-2">
        {pillars.map(p => {
          const c = colorOf(p.status, p.score)
          return (
            <div key={p.name}>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#111827] font-medium">{p.name}</span>
                <span className="font-semibold" style={{ color: c }}>{p.score}</span>
              </div>
              <div className="h-[5px] bg-[#f3f4f6] rounded-full overflow-hidden">
                <div style={{ width: `${Math.max(2, Math.min(100, p.score))}%`, height: '100%', background: c }} />
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
