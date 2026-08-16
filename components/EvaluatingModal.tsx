'use client'

import { useEffect, useState } from 'react'
import { Check, AlertTriangle } from 'lucide-react'

export type EvaluatingStatus = 'evaluating' | 'completing' | 'error'

interface EvaluatingModalProps {
  open: boolean
  username?: string
  status: EvaluatingStatus
  errorMessage?: string
  onComplete: () => void
  labels: {
    title: string
    subtitle: string
    stages: string[]
    completing: string
    error: string
  }
}

export function EvaluatingModal({
  open,
  username,
  status,
  errorMessage,
  onComplete,
  labels,
}: EvaluatingModalProps) {
  const [stageIndex, setStageIndex] = useState(0)
  const clean = username?.replace(/^@/, '') || 'account'
  const initial = clean.charAt(0).toUpperCase() || 'T'

  // Rotate the caption through what the report will actually contain.
  // This is a teaser of real output — not a fake progress percentage.
  useEffect(() => {
    if (status !== 'evaluating') return
    setStageIndex(0)
    const id = setInterval(() => {
      setStageIndex(i => (i + 1) % (labels.stages.length || 1))
    }, 1900)
    return () => clearInterval(id)
  }, [status, labels.stages.length])

  // Auto-dismiss once the result is ready (or after a short pause on error).
  useEffect(() => {
    if (status === 'completing') {
      const id = setTimeout(() => onComplete(), 1100)
      return () => clearTimeout(id)
    }
    if (status === 'error') {
      const id = setTimeout(() => onComplete(), 2800)
      return () => clearTimeout(id)
    }
  }, [status, onComplete])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#060608]/80 p-4 backdrop-blur-md animate-fade-in">
      {/* One calm ambient glow — not four competing corners. */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[#FF0050]/[0.06] blur-[120px]" />

      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0E0E14]/95 shadow-2xl shadow-black/40 backdrop-blur-xl animate-scale-in">
        {/* Single hairline accent. */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF0050]/50 to-transparent" />

        <div className="px-7 py-9 text-center">
          {/* Status eyebrow */}
          <div className="mb-7 inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#00F2EA]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-pulse-cyan rounded-full bg-[#00F2EA] opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#00F2EA]" />
            </span>
            {labels.title}
          </div>

          {status === 'evaluating' && (
            <>
              {/* Focal: the account being valued. */}
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#FF0050] to-[#FF0050]/60 text-xl font-bold text-white shadow-lg shadow-[#FF0050]/20">
                {initial}
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white">@{clean}</h2>
              <p className="mt-1 text-sm text-neutral-400">{labels.subtitle}</p>

              {/* Rotating teaser of the report's contents. */}
              <div className="mt-6 h-5 overflow-hidden">
                <p key={stageIndex} className="text-sm text-neutral-300 animate-fade-in-up">
                  {labels.stages[stageIndex]}
                </p>
              </div>

              {/* Single indeterminate progress line. */}
              <div className="relative mt-5 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-[#FF0050] to-[#00F2EA] animate-indeterminate" />
              </div>

              {/* Honest expectation — removes the "stuck" feeling. */}
              <p className="mt-6 text-xs text-neutral-500">
                Usually 10–20s · Public data only · No login needed
              </p>
            </>
          )}

          {status === 'completing' && (
            <div className="py-3">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#00F2EA]/10 text-[#00F2EA] animate-burst">
                <Check className="h-7 w-7" strokeWidth={2.5} />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white">{labels.completing}</h2>
            </div>
          )}

          {status === 'error' && (
            <div className="py-1">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#FF0050]/10 text-[#FF0050]">
                <AlertTriangle className="h-7 w-7" strokeWidth={2} />
              </div>
              <h2 className="text-lg font-bold tracking-tight text-white">{labels.error}</h2>
              {errorMessage && <p className="mt-2 text-sm text-neutral-400">{errorMessage}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
