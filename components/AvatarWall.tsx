'use client'

import { useState, useEffect, useRef } from 'react'
import { Users, Heart, MapPin, BadgeCheck, TrendingUp } from 'lucide-react'
import type { RecentEvaluation } from '@/types'
import { TIER_COLORS } from '@/lib/tier'
import { valueTierOf } from '@/lib/pillar'

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

/** 价值层级徽章（Spec §7.2：S–F 字母对外换 4 档层级词；色值读 TIER_COLORS） */
function TierBadge({ tier }: { tier: string }) {
  const color = TIER_COLORS[tier] || '#FF0050'
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold leading-tight whitespace-nowrap"
      style={{ color, borderColor: `${color}55`, backgroundColor: `${color}14` }}
    >
      {valueTierOf(tier)}
    </span>
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
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 指针坐标走 ref + 直写 hover card 的 style，避免每次 mousemove 触发整棵头像墙重渲染
  const hoverPos = useRef({ x: 0, y: 0 })
  const hoverCardRef = useRef<HTMLDivElement | null>(null)
  // 重试定时器统一登记，unmount 时清理，避免卸载后仍触发
  const retryTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    let cancelled = false
    const scheduleRetry = (fn: () => void, delay: number) => {
      const id = setTimeout(() => {
        retryTimers.current.delete(id)
        fn()
      }, delay)
      retryTimers.current.add(id)
    }
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
            scheduleRetry(() => load(attempt + 1), 800 * (attempt + 1))
          } else {
            setFailed(true)
            setLoading(false)
          }
        })
        .catch(() => {
          if (cancelled) return
          if (attempt < 2) {
            scheduleRetry(() => load(attempt + 1), 800 * (attempt + 1))
          } else {
            setFailed(true)
            setLoading(false)
          }
        })
    }
    load(0)
    return () => {
      cancelled = true
      retryTimers.current.forEach(clearTimeout)
      retryTimers.current.clear()
      if (leaveTimer.current) clearTimeout(leaveTimer.current)
    }
  }, [])

  const useFallback = !loading && items.length === 0
  const isDemo = useFallback || failed
  const source = isDemo ? FALLBACK_ITEMS : items

  const mid = Math.ceil((loading ? 14 : source.length) / 2)
  const all = loading
    ? Array.from({ length: 14 }).map((_, i) => ({ _skel: i } as unknown as RecentEvaluation))
    : source
  const row1 = all.slice(0, mid)
  const row2 = all.slice(mid)

  const tripledRow1 = [...row1, ...row1, ...row1]
  const tripledRow2 = [...row2, ...row2, ...row2]

  const paused = hovered !== null

  // 直接把最新坐标写入 hover card 元素样式，绕过 React state（mousemove 高频路径不触发重渲染）
  const applyHoverPos = () => {
    const el = hoverCardRef.current
    if (!el) return
    const cardLeft = Math.max(140, Math.min(hoverPos.current.x, window.innerWidth - 140))
    el.style.left = `${cardLeft}px`
    el.style.top = `${hoverPos.current.y}px`
  }

  const handleEnter = (acc: RecentEvaluation, x: number, y: number) => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    hoverPos.current = { x, y }
    setHovered(acc)
  }
  const handleMove = (x: number, y: number) => {
    hoverPos.current = { x, y }
    applyHoverPos()
  }
  const handleLeave = () => {
    leaveTimer.current = setTimeout(() => setHovered(null), 140)
  }
  const handleCardEnter = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
  }

  // 挂载时的初始位置（后续移动由 applyHoverPos 直写 DOM）
  const cardLeft = Math.max(140, Math.min(hoverPos.current.x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 140))

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
                demo={isDemo}
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
                demo={isDemo}
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
          ref={hoverCardRef}
          className="fixed z-50"
          style={{
            left: cardLeft,
            top: hoverPos.current.y,
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
  const color = TIER_COLORS[acc.tier] || '#FF0050'
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
          <TierBadge tier={acc.tier} />
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
  demo,
  onEnter,
  onMove,
  onLeave,
}: {
  acc: RecentEvaluation
  /** 兜底示例数据：降透明度 + title 注明，与真实评估区分 */
  demo?: boolean
  onEnter: (acc: RecentEvaluation, x: number, y: number) => void
  onMove: (x: number, y: number) => void
  onLeave: () => void
}) {
  const color = TIER_COLORS[acc.tier] || '#FF0050'
  return (
    <div
      className={`relative shrink-0${demo ? ' opacity-80' : ''}`}
      title={demo ? '示例数据（Demo）— 等待真实评估数据' : undefined}
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
