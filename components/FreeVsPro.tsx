'use client'

import { Check, Sparkles } from 'lucide-react'
import { CtaButton } from './CtaButton'

interface FreeVsProProps {
  dict: {
    badge: string
    title: string
    free: {
      label: string
      desc: string
      features: ReadonlyArray<string>
      cta: string
    }
    pro: {
      label: string
      desc: string
      price: string
      priceLabel: string
      features: ReadonlyArray<string>
      cta: string
    }
    footer: string
  }
  onProCta?: () => void
  onFreeCta?: () => void
}

export function FreeVsPro({ dict, onProCta, onFreeCta }: FreeVsProProps) {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-5xl px-4">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-4 py-1.5 text-xs font-medium text-[#00F2EA] mb-4">
            {dict.badge}
          </div>
          <h2 className="text-3xl font-bold">{dict.title}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Free Column */}
          <div className="rounded-2xl border border-[#1F1D26] bg-[#0E0E14] p-8 flex flex-col">
            <h3 className="text-lg font-semibold text-neutral-300 mb-1">{dict.free.label}</h3>
            <p className="text-sm text-neutral-500 mb-6">{dict.free.desc}</p>
            
            <div className="text-5xl font-black text-white mb-6">$0</div>
            
            <ul className="space-y-3 mb-8 flex-1">
              {dict.free.features.map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <Check className="h-4 w-4 text-[#2DD4A8] shrink-0 mt-0.5" />
                  <span className="text-neutral-300">{f}</span>
                </li>
              ))}
            </ul>

            <CtaButton
              variant="outline"
              className="w-full border-[#1F1D26] hover:border-[#00F2EA]/40"
              onClick={onFreeCta}
            >
              {dict.free.cta}
            </CtaButton>
          </div>

          {/* Pro Column */}
          <div className="relative rounded-2xl border-2 border-[#FF0050]/30 bg-gradient-to-b from-[#FF0050]/[0.06] to-[#0E0E14] p-8 flex flex-col shadow-lg shadow-[#FF0050]/5">
            {/* Glow accent */}
            <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-[#FF0050]/60 to-transparent" />
            
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-lg font-semibold text-white">{dict.pro.label}</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FF0050]/15 border border-[#FF0050]/25 px-2.5 py-0.5 text-[10px] font-semibold text-[#FF0050]">
                <Sparkles className="h-3 w-3" />
                Recommended
              </span>
            </div>
            <p className="text-sm text-neutral-400 mb-6">{dict.pro.desc}</p>
            
            <p className="text-sm text-neutral-400 mb-6 leading-relaxed">
              Everything in Free, plus revenue breakdowns, brand matching, growth forecasts — all for a <span className="text-white font-semibold">one-time fee</span>. No subscription, no auto-renewal.
            </p>
            
            <ul className="space-y-3 mb-8 flex-1">
              {dict.pro.features.map((f, i) => {
                const isFirst = i === 0
                return (
                  <li key={i} className={`flex items-start gap-3 text-sm ${isFirst ? 'text-neutral-500' : ''}`}>
                    <Check className={`h-4 w-4 shrink-0 mt-0.5 ${isFirst ? 'text-neutral-600' : 'text-[#FF0050]'}`} />
                    <span className={isFirst ? 'text-neutral-500' : 'text-white'}>{f}</span>
                  </li>
                )
              })}
            </ul>

            <CtaButton
              variant="outline"
              className="w-full border-[#FF0050]/40 hover:bg-[#FF0050]/10 text-[#FF0050]"
              onClick={onProCta}
            >
              {dict.pro.cta}
            </CtaButton>
          </div>
        </div>

        <p className="text-center text-sm text-neutral-600 mt-6">{dict.footer}</p>
      </div>
    </section>
  )
}
