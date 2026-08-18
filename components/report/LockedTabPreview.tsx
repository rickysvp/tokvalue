'use client'

// ── LockedTabPreview — 付费决策页的锁定预览（PMF 三层钩子：半遮罩预览层）──
// 免费用户切换到付费 tab 时看到：标题 + 一句话价值 + 3 个具体交付物 + 解锁 CTA。
// 安全约束：不渲染任何付费数据，仅展示静态价值承诺文案。

import { useI18n } from '@/lib/i18n'
import { CtaButton } from '@/components/CtaButton'
import { Lock, CheckCircle2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type LockedTabKind = 'pricing' | 'plan' | 'analysis'

interface LockedTabPreviewProps {
  kind: LockedTabKind
  icon: LucideIcon
  onUnlock: () => void
}

export function LockedTabPreview({ kind, icon: Icon, onUnlock }: LockedTabPreviewProps) {
  const { dict } = useI18n()
  const c = dict.evaluation.commercial

  // PMF 埋点：付费 tab 解锁点击（entry 区分来源页）
  function handleUnlockClick() {
    try {
      const body = JSON.stringify({ event_type: 'deal_toolkit_unlock_clicked', path: window.location.pathname, metadata: { entry: `tab_${kind}` } })
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
    } catch {}
    onUnlock()
  }

  const content = {
    pricing: {
      title: c.lockedPricingTitle,
      desc: c.lockedPricingDesc,
      features: [c.lockedPricingF1, c.lockedPricingF2, c.lockedPricingF3],
    },
    plan: {
      title: c.lockedPlanTitle,
      desc: c.lockedPlanDesc,
      features: [c.lockedPlanF1, c.lockedPlanF2, c.lockedPlanF3],
    },
    analysis: {
      title: c.lockedAnalysisTitle,
      desc: c.lockedAnalysisDesc,
      features: [c.lockedAnalysisF1, c.lockedAnalysisF2, c.lockedAnalysisF3],
    },
  }[kind]

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#FF0050]/25 bg-gradient-to-br from-[#FF0050]/[0.06] via-[#0f0f0f] to-[#0f0f0f] px-6 py-12 sm:px-12">
      {/* 微光装饰 */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-[#FF0050]/10 blur-3xl" />

      <div className="relative flex flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#FF0050]/30 bg-[#FF0050]/10">
          <Lock className="h-5 w-5 text-[#FF0050]" />
        </div>

        <h3 className="mb-2 text-xl sm:text-2xl font-bold text-white">{content.title}</h3>
        <p className="mb-8 max-w-md text-sm text-neutral-400 leading-relaxed">{content.desc}</p>

        <div className="mb-8 grid w-full max-w-md gap-2.5 text-left">
          {content.features.map((f, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#00F2EA]" />
              <span className="text-sm text-neutral-300">{f}</span>
            </div>
          ))}
        </div>

        <CtaButton variant="gradient" size="lg" onClick={handleUnlockClick} icon={<Icon className="h-4 w-4" />}>
          {c.unlockCta}
        </CtaButton>
        <p className="mt-2.5 text-xs text-neutral-500">{c.unlockSub}</p>
      </div>
    </div>
  )
}
