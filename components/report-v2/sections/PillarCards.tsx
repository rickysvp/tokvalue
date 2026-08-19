'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Evaluation } from '@/types'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

const STATUS_COLOR: Record<string, string> = {
  'Strong': '#047857',
  'On track': '#1d4ed8',
  'Needs attention': '#b45309',
}

function PillarBar({ score, animate, color }: { score: number; animate: boolean; color: string }) {
  return (
    <div className="h-2 w-28 overflow-hidden rounded-full bg-[#F3F4F6]">
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: animate ? `${score}%` : '0%', backgroundColor: color }}
      />
    </div>
  )
}

export function PillarCards({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const p = dict.reportV2.pillars
  const pillars = result.pillars?.pillars
  const [visible, setVisible] = useState(false)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setVisible(true); return }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect() }
    }, { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  if (!pillars) return null

  return (
    <section ref={ref}>
      <SectionHeader index={3} title={p.title} subtitle={p.subtitle} id="pillars" />
      <div className="grid gap-3 sm:grid-cols-2">
        {pillars.map(pillar => {
          const color = STATUS_COLOR[pillar.status] ?? '#64748b'
          const open = openKey === pillar.key
          return (
            <button
              key={pillar.key}
              type="button"
              onClick={() => setOpenKey(open ? null : pillar.key)}
              className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[#111827]">{pillar.name}</span>
                <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ color, backgroundColor: `${color}14` }}>
                  {pillar.status}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <PillarBar score={pillar.score} animate={visible} color={color} />
                <span className="text-sm font-semibold tabular-nums text-[#111827]">{pillar.score}</span>
                <ChevronDown className={`ml-auto h-4 w-4 text-[#9CA3AF] transition-transform ${open ? 'rotate-180' : ''}`} />
              </div>
              {open && (
                <div className="mt-3 space-y-2 border-t border-[#E5E7EB] pt-3">
                  <p className="text-[13px] leading-relaxed text-[#374151]">{pillar.attribution}</p>
                  <p className="text-[13px] leading-relaxed text-[#6B7280]"><span className="font-medium text-[#1d4ed8]">{p.improve}:</span> {result.summary.bestAction}</p>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
