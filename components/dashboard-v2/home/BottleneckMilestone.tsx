import Link from 'next/link'
import React from 'react'
import { Card } from '../ui/Card'

export type RateBlocker = {
  label: string
  fix: string
  pillarWeekAnchor?: string
}

export type Milestone = {
  title: string
  description: string
  suggestCta?: { label: string; href: string }
}

export function BottleneckMilestone({
  blocker,
  milestone
}: {
  blocker: RateBlocker
  milestone: Milestone
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Card className="p-4 border-[#b4530925] bg-[linear-gradient(180deg,#fff8e8_0%,#fff_100%)]">
        <div className="text-[11px] text-[#b45309] uppercase tracking-[0.8px] font-semibold mb-2">
          ⚠ Biggest bottleneck
        </div>
        <div className="text-[14px] font-medium text-[#111827] mb-0.5">
          {blocker.label}
        </div>
        <div className="text-[12px] text-[#6b7280] mb-2.5">{blocker.fix}</div>
        <Link
          href={
            blocker.pillarWeekAnchor
              ? `/dashboard/growth#${blocker.pillarWeekAnchor}`
              : '/dashboard/growth'
          }
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[#b45309] underline underline-offset-2"
        >
          See fix in Growth →
        </Link>
      </Card>

      <Card className="p-4 border-[#04785725] bg-[linear-gradient(180deg,#e8f6f0_0%,#fff_100%)]">
        <div className="text-[11px] text-[#047857] uppercase tracking-[0.8px] font-semibold mb-2">
          🏁 Next milestone
        </div>
        <div className="text-[14px] font-medium text-[#111827] mb-0.5">
          {milestone.title}
        </div>
        <div className="text-[12px] text-[#6b7280] mb-2.5">
          {milestone.description}
        </div>
        {milestone.suggestCta ? (
          <Link
            href={milestone.suggestCta.href}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[#047857] underline underline-offset-2"
          >
            {milestone.suggestCta.label} →
          </Link>
        ) : (
          <Link
            href="/dashboard/growth"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[#047857] underline underline-offset-2"
          >
            View plan steps →
          </Link>
        )}
      </Card>
    </div>
  )
}
