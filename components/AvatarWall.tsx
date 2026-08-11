'use client'

import { useState, useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
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

  if (!loading && items.length === 0) return null

  const skeletonCount = 15

  return (
    <section className="py-16">
      <div className="mx-auto max-w-4xl px-4">

        {/* Pure avatar grid — no title, no badge, no subtitle */}
        <div className="flex flex-wrap justify-center gap-3 mb-4">
          {loading
            ? Array.from({ length: skeletonCount }).map((_, i) => (
                <div
                  key={`skel-${i}`}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-neutral-800 animate-pulse shrink-0"
                />
              ))
            : items.map((acc) => {
            const ringColor = TIER_COLORS[acc.tier] || '#E8A840'
            return (
              <button
                key={acc.username}
                onClick={() => onSelect(acc.username)}
                className="group relative shrink-0"
                title={`@${acc.username} · Tier ${acc.tier}`}
              >
                {/* Glow ring behind avatar */}
                <div
                  className="absolute -inset-[3px] rounded-full transition-all group-hover:scale-105 group-hover:opacity-100 opacity-80"
                  style={{ boxShadow: `0 0 16px ${ringColor}55` }}
                />

                {/* Avatar with tier ring */}
                <div
                  className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center overflow-hidden transition-all"
                  style={{
                    border: `2.5px solid ${ringColor}`,
                    backgroundColor: '#1A1A24',
                  }}
                >
                  {acc.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={acc.avatar}
                      alt={acc.nickname}
                      className="w-full h-full object-cover rounded-full group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <span className="text-lg sm:text-xl font-bold text-neutral-500">
                      {acc.nickname.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Hover: tier chip */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
                    style={{ backgroundColor: `${ringColor}22`, color: ringColor }}
                  >
                    {acc.tier}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Single line below the wall */}
        {!loading && (
          <p className="text-center text-[11px] text-neutral-600">
            Trusted by {items.length}+ creators · Real valuations · No fake data
          </p>
        )}

        {/* CTA — lightweight, just a link */}
        <div className="text-center mt-5">
          <button
            onClick={() => {
              const input = document.querySelector<HTMLInputElement>(
                'input[aria-label*="username"], input[placeholder*="username"]'
              )
              if (input) {
                input.focus()
                input.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-[#00F2EA] transition-colors"
          >
            Evaluate your account — free
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

      </div>
    </section>
  )
}
