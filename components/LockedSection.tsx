'use client'

import { Lock } from 'lucide-react'
import { SectionHeader } from '@/components/SectionHeader'
import { CtaButton } from '@/components/CtaButton'

interface LockedSectionProps {
  step: string
  title: string
  icon: React.ReactNode
  /** Preview content shown above the blur gradient */
  teaser: React.ReactNode
  /** Full content (rendered hidden for PDF export compatibility) */
  children?: React.ReactNode
  unlockLabel?: string
  priceLabel?: string
  onUnlock: () => void
}

/**
 * LockedSection — Freemium tier locked content block.
 *
 * Shows section header + teaser preview + frosted-glass gradient overlay
 * with inline unlock CTA. Full content is rendered hidden.
 */
export function LockedSection({
  step,
  title,
  icon,
  teaser,
  children,
  unlockLabel = 'Unlock',
  priceLabel = '$9',
  onUnlock,
}: LockedSectionProps) {
  return (
    <div className="mb-10">
      <SectionHeader step={step} title={title} icon={icon} />

      {/* Teaser layer */}
      <div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] to-[#141414]">
        <div className="p-6 sm:p-8 opacity-60 pointer-events-none select-none">
          {teaser}
        </div>

        {/* Frosted glass gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/85 to-transparent flex flex-col items-center justify-end pb-6 gap-3">
          <div className="flex items-center gap-2 text-neutral-400">
            <Lock className="h-3.5 w-3.5" />
            <span className="text-xs font-medium tracking-wide">{unlockLabel} {title}</span>
          </div>
          <CtaButton
            variant="gradient"
            size="sm"
            onClick={onUnlock}
            icon={<Lock className="h-3.5 w-3.5" />}
          >
            {unlockLabel} Full Report — {priceLabel}
          </CtaButton>
        </div>

        {/* Subtle top-edge glow line */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#FF0050]/40 to-transparent" />
      </div>

      {/* Full content — hidden, kept for PDF export */}
      {children && (
        <div className="hidden locked-content" data-locked-section={step}>
          <SectionHeader step={step} title={title} icon={icon} />
          <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] to-[#141414] p-6 sm:p-8">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

export default LockedSection
