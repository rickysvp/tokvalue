'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

export function Methodology({ dict }: { dict: EnDict }) {
  const [open, setOpen] = useState(false)
  const m = dict.reportV2.method
  return (
    <section>
      <SectionHeader index={14} title={m.title} id="methodology" />
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center justify-between text-left">
          <span className="text-sm font-medium text-[#1d4ed8]">{m.title}</span>
          <ChevronDown className={`h-4 w-4 text-[#9CA3AF] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && <p className="mt-3 text-[13px] leading-relaxed text-[#374151]">{m.body}</p>}
      </div>
    </section>
  )
}
