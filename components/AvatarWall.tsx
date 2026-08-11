'use client'

import { useState, useEffect } from 'react'
import { Users, ArrowRight } from 'lucide-react'
import type { RecentEvaluation } from '@/types'

const TIER_COLORS: Record<string, string> = {
  S: '#FF0050',
  A: '#E8A840',
  B: '#00F2EA',
  C: '#22c55e',
  D: '#8B5CF6',
  E: '#6B7280',
  F: '#6B7280',
}

interface AvatarWallProps {
  /** Fired when user clicks an avatar — navigate to /evaluate/{username} */
  onSelect: (username: string) => void
}

export function AvatarWall({ onSelect }: AvatarWallProps) {
  const [items, setItems] = useState<RecentEvaluation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/recent-evaluations', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data?.evaluations?.length) setItems(data.evaluations)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // No data after fetch — don't render
  if (!loading && items.length === 0) return null

  const skeletonCount = 15

  return (
    <section className="py-20">
      <div className="mx-auto max-w-5xl px-4">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-4 py-1.5 text-xs font-medium text-[#00F2EA] mb-4">
            <Users className="h-3.5 w-3.5" />
            Social Proof
          </div>
          <h2 className="text-3xl font-bold mb-3">Trusted by creators worldwide</h2>
          {loading ? (
            <div className="h-5 w-64 mx-auto rounded bg-neutral-800 animate-pulse" />
          ) : (
            <p className="text-neutral-400 max-w-lg mx-auto">
              {items.length}+ TikTok accounts evaluated. Real data, real valuations.
            </p>
          )}
        </div>

        {/* Avatar Grid — dense grid, responsive columns */}
        <div className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto mb-8">
          {loading
            ? Array.from({ length: skeletonCount }).map((_, i) => (
                <div
                  key={`skel-${i}`}
                  className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-neutral-800 animate-pulse shrink-0"
                />
              ))
            : items.map((acc) => {
            const ringColor = TIER_COLORS[acc.tier] || '#E8A840'
            return (
              <button
                key={acc.username}
                onClick={() => onSelect(acc.username)}
                className="group relative shrink-0"
                title={`@${acc.username} · Tier ${acc.tier} · Score ${acc.score}`}
              >
                {/* Tier ring */}
                <div
                  className="absolute -inset-[2px] rounded-full transition-all group-hover:scale-110 group-hover:opacity-100 opacity-60"
                  style={{ boxShadow: `0 0 12px ${ringColor}44` }}
                />
                {/* Avatar circle */}
                <div
                  className="relative w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full flex items-center justify-center overflow-hidden border-2 transition-all"
                  style={{ borderColor: ringColor, backgroundColor: '#1A1A24' }}
                >
                  {acc.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={acc.avatar}
                      alt={acc.nickname}
                      className="w-full h-full object-cover rounded-full"
                    />
                  ) : (
                    <span className="text-base sm:text-lg font-bold text-neutral-500">
                      {acc.nickname.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                {/* Tier badge — tiny label below avatar on hover or always visible */}
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
                    style={{ backgroundColor: `${ringColor}22`, color: ringColor }}
                  >
                    Tier {acc.tier}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* CTA */}
        <div className="text-center">
          <button
            onClick={() => {
              const input = document.querySelector<HTMLInputElement>('input[aria-label*="username"], input[placeholder*="username"]')
              if (input) { input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
            }}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#00F2EA] hover:text-[#00F2EA]/80 transition-colors"
          >
            Evaluate your account — free first report
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  )
}
