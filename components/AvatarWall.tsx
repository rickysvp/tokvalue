'use client'

import { useState, useEffect, useRef } from 'react'
import { Users, Heart, MapPin, BadgeCheck, TrendingUp } from 'lucide-react'
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

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${Math.round(n).toLocaleString()}`
}

/** 等级圆环（紧凑版，用于卡片） */
function TierBadge({ tier, size = 40 }: { tier: string; size?: number }) {
  const color = TIER_COLORS[tier] || '#E8A840'
  const stroke = 3
  const radius = (size - stroke) / 2
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="transparent" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={stroke} fill="transparent" strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * radius * 0.82} ${2 * Math.PI * radius}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-extrabold uppercase leading-none" style={{ fontSize: size * 0.42, color }}>{tier}</span>
      </div>
    </div>
  )
}

function SkeletonCircle() {
  return (
    <div className="shrink-0">
      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-neutral-800 animate-pulse" />
    </div>
  )
}

/** 兜底示例数据：API 失败/空数据时用，保证头像墙永不消失（纯本地渲染，不写库） */
const FALLBACK_ITEMS: RecentEvaluation[] = [
  { username: 'creators', nickname: 'Creator', avatar: null, tier: 'S', score: 95, followerCount: 1200000, totalLikes: 54000000, videoCount: 320, region: 'US', verified: true, categories: ['Lifestyle'], personaType: null, businessValueHigh: 120000, computedAt: '' },
  { username: 'creator2', nickname: 'Creator', avatar: null, tier: 'A', score: 88, followerCount: 480000, totalLikes: 12000000, videoCount: 140, region: 'UK', verified: true, categories: ['Beauty'], personaType: null, businessValueHigh: 60000, computedAt: '' },
  { username: 'creator3', nickname: 'Creator', avatar: null, tier: 'B', score: 74, followerCount: 150000, totalLikes: 3200000, videoCount: 90, region: 'DE', verified: false, categories: ['Fitness'], personaType: null, businessValueHigh: 25000, computedAt: '' },
  { username: 'creator4', nickname: 'Creator', avatar: null, tier: 'A', score: 82, followerCount: 260000, totalLikes: 6800000, videoCount: 110, region: 'US', verified: false, categories: ['Tech'], personaType: null, businessValueHigh: 38000, computedAt: '' },
  { username: 'creator5', nickname: 'Creator', avatar: null, tier: 'C', score: 61, followerCount: 42000, totalLikes: 900000, videoCount: 60, region: 'FR', verified: false, categories: ['Food'], personaType: null, businessValueHigh: 9000, computedAt: '' },
  { username: 'creator6', nickname: 'Creator', avatar: null, tier: 'B', score: 70, followerCount: 88000, totalLikes: 2100000, videoCount: 75, region: 'US', verified: false, categories: ['Comedy'], personaType: null, businessValueHigh: 15000, computedAt: '' },
  { username: 'creator7', nickname: 'Creator', avatar: null, tier: 'S', score: 92, followerCount: 2100000, totalLikes: 88000000, videoCount: 410, region: 'US', verified: true, categories: ['Music'], personaType: null, businessValueHigh: 200000, computedAt: '' },
  { username: 'creator8', nickname: 'Creator', avatar: null, tier: 'A', score: 79, followerCount: 310000, totalLikes: 7600000, videoCount: 130, region: 'CA', verified: false, categories: ['Fashion'], personaType: null, businessValueHigh: 42000, computedAt: '' },
]

export function AvatarWall() {
  const [items, setItems] = useState<RecentEvaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [hovered, setHovered] = useState<RecentEvaluation | null>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = (attempt: number) => {
      fetch('/api/recent-evaluations', { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
          if (cancelled) return
          if (data?.evaluations?.length) {
            setItems(data.evaluations)
            setFailed(false)
            setLoading(false)
          } else if (attempt < 2) {
            // 空数据可能是瞬时抖动，退避重试
            setTimeout(() => load(attempt + 1), 800 * (attempt + 1))
          } else {
            setFailed(true)
            setLoading(false)
          }
        })
        .catch(() => {
          if (cancelled) return
          if (attempt < 2) {
            setTimeout(() => load(attempt + 1), 800 * (attempt + 1))
          } else {
            setFailed(true)
            setLoading(false)
          }
        })
    }
    load(0)
    return () => { cancelled = true }
  }, [])

  const useFallback = !loading && items.length === 0
  const source = useFallback || failed ? FALLBACK_ITEMS : items

  const mid = Math.ceil((loading ? 14 : source.length) / 2)
  const all = loading
    ? Array.from({ length: 14 }).map((_, i) => ({ _skel: i } as unknown as RecentEvaluation))
    : source
  const row1 = all.slice(0, mid)
  const row2 = all.slice(mid)

  const tripledRow1 = [...row1, ...row1, ...row1]
  const tripledRow2 = [...row2, ...row2, ...row2]

  const paused = hovered !== null

  const handleEnter = (acc: RecentEvaluation, x: number, y: number) => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    setHovered(acc)
    setPos({ x, y })
  }
  const handleMove = (x: number, y: number) => setPos({ x, y })
  const handleLeave = () => {
    leaveTimer.current = setTimeout(() => setHovered(null), 140)
  }
  const handleCardEnter = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
  }

  const cardLeft = Math.max(140, Math.min(pos.x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 140))

  return (
    <div className="mt-0 max-w-[100vw]">
      {/* Row 1 — right to left, slow */}
      <div className="relative overflow-hidden">
        <div className={`flex animate-marquee-slow ${paused ? '[animation-play-state:paused]' : ''}`}>
          {tripledRow1.map((acc, i) =>
            loading ? (
              <SkeletonCircle key={`s1-${i}`} />
            ) : (
              <AvatarCircle
                key={`${acc.username}-${i}`}
                acc={acc}
                onEnter={handleEnter}
                onMove={handleMove}
                onLeave={handleLeave}
              />
            )
          )}
        </div>
      </div>
      {/* Row 2 — left to right, faster */}
      <div className="relative overflow-hidden">
        <div className={`flex animate-marquee-reverse ${paused ? '[animation-play-state:paused]' : ''}`}>
          {tripledRow2.map((acc, i) =>
            loading ? (
              <SkeletonCircle key={`s2-${i}`} />
            ) : (
              <AvatarCircle
                key={`${acc.username}-${i}`}
                acc={acc}
                onEnter={handleEnter}
                onMove={handleMove}
                onLeave={handleLeave}
              />
            )
          )}
        </div>
      </div>

      {/* Hover card — follows cursor, anchored above avatar */}
      {hovered && (
        <div
          className="fixed z-50"
          style={{
            left: cardLeft,
            top: pos.y,
            transform: 'translate(-50%, calc(-100% - 14px))',
          }}
          onMouseEnter={handleCardEnter}
          onMouseLeave={handleLeave}
        >
          <HoverCard acc={hovered} />
        </div>
      )}
    </div>
  )
}

function HoverCard({ acc }: { acc: RecentEvaluation }) {
  const color = TIER_COLORS[acc.tier] || '#E8A840'
  return (
    <div className="relative w-60 rounded-2xl border border-neutral-800 bg-[#141414] shadow-2xl shadow-black/70 overflow-hidden">
      {/* 顶部渐变光带（按等级着色） */}
      <div
        className="absolute top-0 left-0 right-0 h-14 opacity-30"
        style={{ background: `linear-gradient(180deg, ${color}22 0%, transparent 100%)` }}
      />

      <div className="relative p-4">
        {/* 行 1：头像 + 昵称 + 等级 */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              {acc.avatarData || acc.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={acc.avatarData || acc.avatar || undefined}
                  alt={acc.nickname}
                  className="w-10 h-10 rounded-full border-2 object-cover"
                  style={{ borderColor: `${color}55` }}
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-base font-bold text-neutral-400"
                  style={{ borderColor: `${color}55`, backgroundColor: '#1a1a1a' }}
                >
                  {acc.nickname.charAt(0).toUpperCase()}
                </div>
              )}
              {acc.verified && (
                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#0a0a0a] flex items-center justify-center">
                  <BadgeCheck className="h-3.5 w-3.5 text-[#00F2EA]" />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">{acc.nickname}</h3>
              <p className="text-[11px] text-neutral-500 truncate">@{acc.username}</p>
            </div>
          </div>
          <TierBadge tier={acc.tier} size={36} />
        </div>

        {/* 行 2：品类标签 */}
        <div className="flex flex-wrap gap-1 mb-2.5 min-h-[18px]">
          {acc.categories.slice(0, 2).map((cat, i) => (
            <span
              key={i}
              className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded border border-neutral-700/60 text-neutral-400 bg-neutral-800/40"
            >
              {cat.length > 14 ? cat.slice(0, 12) + '…' : cat}
            </span>
          ))}
        </div>

        {/* 行 3：核心指标 */}
        <div className="flex items-center gap-3 text-[11px] text-neutral-400">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3 text-neutral-600" /> {fmt(acc.followerCount)}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3 text-neutral-600" /> {fmt(acc.totalLikes)}
          </span>
          {acc.region && (
            <span className="flex items-center gap-1 ml-auto">
              <MapPin className="h-3 w-3 text-neutral-600" /> {acc.region}
            </span>
          )}
        </div>

        {/* 行 4：估值 */}
        <div className="mt-3 pt-3 border-t border-neutral-800/60 flex items-center justify-between">
          <div>
            <div className="text-[9px] text-neutral-600 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="h-2.5 w-2.5" /> Est. Value
            </div>
            <div className="text-sm font-bold tabular-nums" style={{ color }}>
              {fmtUsd(acc.businessValueHigh)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AvatarCircle({
  acc,
  onEnter,
  onMove,
  onLeave,
}: {
  acc: RecentEvaluation
  onEnter: (acc: RecentEvaluation, x: number, y: number) => void
  onMove: (x: number, y: number) => void
  onLeave: () => void
}) {
  const color = TIER_COLORS[acc.tier] || '#E8A840'
  return (
    <div
      className="relative shrink-0"
      onMouseEnter={(e) => onEnter(acc, e.clientX, e.clientY)}
      onMouseMove={(e) => onMove(e.clientX, e.clientY)}
      onMouseLeave={onLeave}
    >
      <div
        className="rounded-full p-[2.5px]"
        style={{ backgroundColor: color }}
      >
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center overflow-hidden bg-[#1A1A24]">
          {acc.avatarData || acc.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={acc.avatarData || acc.avatar || undefined}
              alt={acc.nickname}
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            <span className="text-xl font-bold text-neutral-500">
              {acc.nickname.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
