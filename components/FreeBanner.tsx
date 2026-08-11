'use client'

import { Sparkles, Lock } from 'lucide-react'
import { CtaButton } from '@/components/CtaButton'

interface FreeBannerProps {
  tier: string
  onUnlock: () => void
}

/**
 * FreeBanner — Top banner on free-tier report pages.
 *
 * "Free Preview" badge on the left, unlock CTA on the right.
 * Placed between account header and tab navigation.
 */
export function FreeBanner({ tier, onUnlock }: FreeBannerProps) {
  return (
    <div className="mb-6 rounded-xl border border-[#FF0050]/20 bg-gradient-to-r from-[#FF0050]/5 via-[#0f0f0f] to-[#00F2EA]/5 px-5 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-[#00F2EA]/30 bg-[#00F2EA]/10 px-2.5 py-1 text-[11px] font-semibold text-[#00F2EA]">
          <Sparkles className="h-3 w-3" />
          FREE PREVIEW
        </span>
        <span className="text-sm text-neutral-400">
          Tier <span className="font-bold text-white">{tier}</span> — Scores &amp; valuation are visible
        </span>
      </div>
      <CtaButton
        variant="gradient"
        size="sm"
        onClick={onUnlock}
        icon={<Lock className="h-3.5 w-3.5" />}
      >
        Unlock Full Report — $9
      </CtaButton>
    </div>
  )
}

export default FreeBanner
