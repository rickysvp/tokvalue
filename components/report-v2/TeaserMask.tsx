'use client'

import { Lock } from 'lucide-react'
import { useState } from 'react'

/** 锁定判定：非 premium 时 section 显示首屏 + 遮罩 */
export function shouldMaskSection(isPremium: boolean, sectionHasData: boolean): boolean {
  return !isPremium && sectionHasData
}

export function TeaserMask({ locked, children, ctaText }: {
  locked: boolean
  children: React.ReactNode
  ctaText: string
}) {
  const [expanded, setExpanded] = useState(false)
  if (!locked) return <>{children}</>
  return (
    <div className="relative">
      <div className="max-h-[280px] overflow-hidden" aria-hidden="true">
        <div className="pointer-events-none select-none">{children}</div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex h-[120px] flex-col items-center justify-end bg-gradient-to-b from-white/0 via-white/80 to-white pb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#374151] shadow-sm">
          <Lock className="h-3.5 w-3.5 text-[#6B7280]" />
          {ctaText}
        </span>
      </div>
    </div>
  )
}
