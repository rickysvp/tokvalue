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
  /**
   * 兼容旧调用方的占位 prop（原本为 PDF 导出而隐藏渲染完整付费内容）。
   * 安全约束：锁定态下绝不渲染 children —— 付费数据一旦进入 DOM 即可被
   * devtools / 爬虫白嫖，此处只保留锁态占位 UI，由付费后的完整数据渲染付费模块。
   */
  children?: React.ReactNode
  unlockLabel?: string
  priceLabel?: string
  onUnlock: () => void
}

/**
 * LockedSection — Freemium tier locked content block.
 *
 * Shows section header + teaser preview + frosted-glass gradient overlay
 * with inline unlock CTA. Full paid content is NOT rendered in the DOM.
 */
export function LockedSection({
  step,
  title,
  icon,
  teaser,
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
    </div>
  )
}

export default LockedSection
