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
  onSelect: (username: string) => void
}

function AvatarItem({ acc, onClick }: { acc: RecentEvaluation; onClick: () => void }) {
  const ringColor = TIER_COLORS[acc.tier] || '#E8A840'
  return (
    <button
      onClick={onClick}
      className="group relative shrink-0 mx-1.5"
      title={`@${acc.username} · Tier ${acc.tier} · Score ${acc.score}`}
    >
      {/* Glow ring */}
      <div
        className="absolute -inset-[2.5px] rounded-full opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300"
        style={{ boxShadow: `0 0 18px ${ringColor}66` }}
      />
      {/* Avatar */}
      <div
        className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center overflow-hidden transition-all duration-300 group-hover:scale-105"
        style={{
          border: `2px solid ${ringColor}`,
          backgroundColor: '#1A1A24',
        }}
      >
        {acc.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={acc.avatar}
            alt={acc.nickname}
            className="w-full h-full object-cover rounded-full"
          />
        ) : (
          <span className="text-base font-bold text-neutral-500">
            {acc.nickname.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
    </button>
  )
}

function SkeletonItem() {
  return (
    <div className="shrink-0 mx-1.5">
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-neutral-800 animate-pulse" />
    </div>
  )
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

  // Split items into two rows for staggered marquee
  const mid = Math.ceil(items.length / 2)
  const row1 = loading ? [] : items.slice(0, mid)
  const row2 = loading ? [] : items.slice(mid)

  // Triple each row for seamless loop
  const marquee = (row: RecentEvaluation[]) =>
    [...row, ...row, ...row].map((acc, i) => (
      <AvatarItem key={`${acc.username}-${i}`} acc={acc} onClick={() => onSelect(acc.username)} />
    ))

  const skeletonRow = () =>
    Array.from({ length: 20 }).map((_, i) => <SkeletonItem key={`skel-${i}`} />)

  return (
    <section className="py-20 overflow-hidden">
      <div className="mx-auto max-w-5xl px-4">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-4 py-1.5 text-xs font-medium text-[#00F2EA] mb-4">
            <Users className="h-3.5 w-3.5" />
            Social Proof
          </div>
          <h2 className="text-3xl font-bold mb-3">Trusted by creators worldwide</h2>
          <p className="text-sm text-neutral-500 mb-2">
            Real TikTok accounts evaluated by TokValue. Every avatar = a verified valuation.
          </p>
          {loading ? (
            <div className="h-5 w-64 mx-auto rounded bg-neutral-800 animate-pulse" />
          ) : (
            <p className="text-neutral-400 max-w-lg mx-auto">
              {items.length}+ TikTok accounts evaluated. Real data, real valuations.
            </p>
          )}
        </div>
      </div>

      {/* Scrolling avatar rows — full-width */}
      <div className="space-y-3 mb-8 max-w-[100vw]">
        {/* Row 1 — scroll right-to-left */}
        <div className="relative overflow-hidden">
          <div className="flex animate-marquee">
            {loading
              ? skeletonRow()
              : marquee(row1)}
          </div>
        </div>
        {/* Row 2 — scroll left-to-right, faster */}
        <div className="relative overflow-hidden">
          <div className="flex animate-marquee-reverse">
            {loading
              ? skeletonRow()
              : marquee(row2)}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4">
        {/* Subtle line below the wall */}
        {!loading && (
          <p className="text-center text-[11px] text-neutral-600 mb-6">
            {items.length}+ accounts · Tier S to F · Scores updated in real-time
          </p>
        )}

        {/* CTA */}
        <div className="text-center">
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
