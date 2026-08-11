'use client'

import { useState, useEffect } from 'react'
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

function SkeletonCircle() {
  return (
    <div className="shrink-0 mx-2.5">
      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-neutral-800 animate-pulse" />
    </div>
  )
}

export function AvatarWall() {
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

  const mid = Math.ceil((loading ? 14 : items.length) / 2)
  const all = loading
    ? Array.from({ length: 14 }).map((_, i) => ({ _skel: i } as unknown as RecentEvaluation))
    : items
  const row1 = all.slice(0, mid)
  const row2 = all.slice(mid)

  const tripledRow1 = [...row1, ...row1, ...row1]
  const tripledRow2 = [...row2, ...row2, ...row2]

  return (
    <div className="mt-0 space-y-3 max-w-[100vw]">
      {/* Row 1 — right to left, slow */}
      <div className="relative overflow-hidden">
        <div className="flex animate-marquee-slow">
          {tripledRow1.map((acc, i) =>
            loading ? (
              <SkeletonCircle key={`s1-${i}`} />
            ) : (
              <AvatarCircle key={`${acc.username}-${i}`} tier={acc.tier} avatar={acc.avatar} nickname={acc.nickname} />
            )
          )}
        </div>
      </div>
      {/* Row 2 — left to right, faster */}
      <div className="relative overflow-hidden">
        <div className="flex animate-marquee-reverse">
          {tripledRow2.map((acc, i) =>
            loading ? (
              <SkeletonCircle key={`s2-${i}`} />
            ) : (
              <AvatarCircle key={`${acc.username}-${i}`} tier={acc.tier} avatar={acc.avatar} nickname={acc.nickname} />
            )
          )}
        </div>
      </div>
    </div>
  )
}

function AvatarCircle({
  tier,
  avatar,
  nickname,
}: {
  tier: string
  avatar?: string | null
  nickname: string
}) {
  const color = TIER_COLORS[tier] || '#E8A840'
  return (
    <div
      className="relative shrink-0 mx-2.5"
      style={{ boxShadow: `0 0 24px ${color}55` }}
    >
      <div
        className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center overflow-hidden"
        style={{
          border: `2.5px solid ${color}`,
          backgroundColor: '#1A1A24',
        }}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt={nickname}
            className="w-full h-full object-cover rounded-full"
          />
        ) : (
          <span className="text-xl font-bold text-neutral-500">
            {nickname.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
    </div>
  )
}
