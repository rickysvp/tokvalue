'use client'

import { Search, BarChart3, FileText } from 'lucide-react'

interface HowItWorksProps {
  dict: {
    badge: string
    title: string
    steps: ReadonlyArray<{ number: string; title: string; desc: string }>
    cta: string
  }
}

export function HowItWorks({ dict }: HowItWorksProps) {
  const icons = [Search, BarChart3, FileText]
  
  return (
    <section className="py-20">
      <div className="mx-auto max-w-5xl px-4">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-4 py-1.5 text-xs font-medium text-[#00F2EA] mb-4">
            {dict.badge}
          </div>
          <h2 className="text-3xl font-bold">{dict.title}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {dict.steps.map((step, i) => {
            const Icon = icons[i]
            return (
              <div key={i} className="relative text-center">
                {/* Arrow connector (desktop only) */}
                {i < 2 && (
                  <div className="hidden md:block absolute top-8 left-[calc(50%+3rem)] w-[calc(100%-6rem)] h-px bg-gradient-to-r from-[#00F2EA]/30 to-transparent" />
                )}
                
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#0E0E14] border border-[#1F1D26] mb-4">
                  <Icon className="h-7 w-7 text-[#00F2EA]" />
                </div>
                <div className="text-xs font-bold text-[#00F2EA] mb-2">Step {step.number}</div>
                <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-neutral-400 leading-relaxed max-w-xs mx-auto">{step.desc}</p>
              </div>
            )
          })}
        </div>

        <p className="text-center text-sm text-neutral-500">{dict.cta}</p>
      </div>
    </section>
  )
}
