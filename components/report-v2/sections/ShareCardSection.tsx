'use client'

import { useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Evaluation } from '@/types'
import { drawShareCard } from '../share-canvas'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

export function ShareCardSection({ result, dict, isPremium, labels }: {
  result: Evaluation
  dict: EnDict
  isPremium: boolean
  labels: { title: string; subtitle: string; download: string }
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rendered, setRendered] = useState(false)

  const render = () => {
    if (canvasRef.current) {
      drawShareCard(canvasRef.current, result, isPremium)
      setRendered(true)
    }
  }

  const download = () => {
    if (!canvasRef.current) return
    render()
    const link = document.createElement('a')
    link.download = `tokvalue-${result.username}.png`
    link.href = canvasRef.current.toDataURL('image/png')
    link.click()
  }

  return (
    <section>
      <SectionHeader index={8} title={labels.title} subtitle={labels.subtitle} id="share-card" />
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <canvas ref={canvasRef} className="w-full rounded-xl border border-[#E5E7EB]" style={{ aspectRatio: '1200/630' }} />
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onMouseEnter={render}
            onClick={download}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1d4ed8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1e40af] transition-colors"
          >
            <Download className="h-4 w-4" />
            {labels.download}
          </button>
        </div>
      </div>
    </section>
  )
}
