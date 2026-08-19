'use client'

import { Info } from 'lucide-react'

export function MetricCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
        {label}
        {hint && (
          <span className="group relative inline-flex">
            <Info className="h-3.5 w-3.5 cursor-help text-[#9CA3AF]" />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-48 -translate-x-1/2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs leading-relaxed text-[#374151] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {hint}
            </span>
          </span>
        )}
      </div>
      <div className="mt-1 text-lg font-semibold text-[#111827] tabular-nums">{value}</div>
    </div>
  )
}
