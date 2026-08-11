'use client'

import { Lock, TrendingUp, DollarSign, Building2 } from 'lucide-react'
import { CtaButton } from '@/components/CtaButton'

interface UnlockFooterProps {
  onUnlock: () => void
  /** Whether to show the sticky version (mobile) */
  sticky?: boolean
}

const lockedFeatures = [
  { icon: DollarSign, label: 'Income Breakdown' },
  { icon: TrendingUp, label: 'Growth & Trends' },
  { icon: Building2, label: 'Brand Matching' },
]

/**
 * UnlockFooter — Bottom CTA bar for free-tier report pages.
 *
 * Lists locked feature modules and a prominent unlock button.
 * Sticky variant for mobile: fixed at viewport bottom with backdrop blur.
 */
export function UnlockFooter({ onUnlock, sticky = false }: UnlockFooterProps) {
  const baseClasses = sticky
    ? 'fixed bottom-0 inset-x-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-neutral-800 px-4 py-4'
    : 'rounded-2xl border border-[#FF0050]/15 bg-gradient-to-r from-[#FF0050]/5 to-[#00F2EA]/5 p-6'

  return (
    <div className={baseClasses}>
      <div className="mx-auto max-w-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Feature list */}
        <div className="flex items-center gap-4 flex-wrap">
          <Lock className="h-4 w-4 text-[#FF0050] shrink-0" />
          <div className="flex items-center gap-3 text-xs text-neutral-400">
            {lockedFeatures.map(({ icon: Icon, label }, i) => (
              <span key={label} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-neutral-700">·</span>}
                <Icon className="h-3.5 w-3.5 text-neutral-500" />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* CTA */}
        <CtaButton
          variant="gradient"
          size="md"
          onClick={onUnlock}
          icon={<Lock className="h-4 w-4" />}
        >
          Unlock Full Report — $9
        </CtaButton>
      </div>

      {/* Price reassurance */}
      <p className="text-center text-[10px] text-neutral-600 mt-2">
        One-time payment · Permanent access · 12+ modules · PDF export
      </p>
    </div>
  )
}

export default UnlockFooter
