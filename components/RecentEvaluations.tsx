'use client'

import { useState, useEffect } from 'react'
import { TIER_COLORS } from '@/lib/tier'
import { Users, Heart, MapPin, BadgeCheck, Sparkles, ArrowRight, Lock, TrendingUp } from 'lucide-react'
import type { RecentEvaluation } from '@/types'
import { CtaButton } from './CtaButton'

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
function TierBadge({ tier, size = 44 }: { tier: string; size?: number }) {
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

interface Props {
  /** 点击卡片：触发付费墙（传入用户名） */
  onSelect: (username: string) => void
}

export function RecentEvaluations({ onSelect }: Props) {
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

  if (loading) {
    return (
      <section className="border-b border-neutral-800 py-12">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="h-5 w-5 text-[#00F2EA]" />
            <h2 className="text-xl sm:text-2xl font-bold text-white">Recently Evaluated</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-44 rounded-2xl border border-neutral-800 bg-[#141414] animate-pulse" />
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (items.length === 0) return null

  return (
    <section className="border-b border-neutral-800 py-12">
      <div className="mx-auto max-w-5xl px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#00F2EA]" />
            <h2 className="text-xl sm:text-2xl font-bold text-white">Recently Evaluated</h2>
          </div>
          <span className="text-xs text-neutral-500">{items.length} accounts indexed</span>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((acc) => {
            const tierColor = TIER_COLORS[acc.tier] || '#E8A840'
            return (
              <button
                key={acc.username}
                onClick={() => onSelect(acc.username)}
                className="group relative text-left rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#141414] to-[#0f0f0f] overflow-hidden hover:border-[#00F2EA]/40 transition-all hover:-translate-y-1"
              >
                {/* 顶部渐变光带（按等级着色） */}
                <div
                  className="absolute top-0 left-0 right-0 h-16 opacity-30 group-hover:opacity-50 transition-opacity"
                  style={{ background: `linear-gradient(180deg, ${tierColor}22 0%, transparent 100%)` }}
                />

                {/* 内容 */}
                <div className="relative p-4">
                  {/* 行 1：头像 + 等级 */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="relative">
                      {acc.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={acc.avatar}
                          alt={acc.nickname}
                          className="w-11 h-11 rounded-full border-2 object-cover"
                          style={{ borderColor: `${tierColor}55` }}
                        />
                      ) : (
                        <div
                          className="w-11 h-11 rounded-full border-2 flex items-center justify-center text-base font-bold text-neutral-400"
                          style={{ borderColor: `${tierColor}55`, backgroundColor: '#1a1a1a' }}
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
                    <TierBadge tier={acc.tier} />
                  </div>

                  {/* 行 2：昵称 + @username */}
                  <div className="mb-2 min-w-0">
                    <h3 className="text-sm font-bold text-white truncate group-hover:text-[#00F2EA] transition-colors">
                      {acc.nickname}
                    </h3>
                    <p className="text-[11px] text-neutral-500 truncate">@{acc.username}</p>
                  </div>

                  {/* 行 3：品类标签 */}
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

                  {/* 行 4：核心指标 */}
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

                  {/* 行 5：估值 + 解锁提示 */}
                  <div className="mt-3 pt-3 border-t border-neutral-800/60 flex items-center justify-between">
                    <div>
                      <div className="text-[9px] text-neutral-600 uppercase tracking-wider flex items-center gap-1">
                        <TrendingUp className="h-2.5 w-2.5" /> Est. Value
                      </div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: tierColor }}>
                        {fmtUsd(acc.businessValueHigh)}
                      </div>
                    </div>
                    <span className="text-[10px] text-neutral-600 group-hover:text-[#00F2EA] flex items-center gap-1 transition-colors">
                      <Lock className="h-3 w-3" /> Unlock
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* ═══ 底部 CTA：引导用户评估自己的账号，而非看别人的 ═══ */}
        <div className="text-center mt-8 pt-6 border-t border-neutral-800/60">
          <p className="text-sm text-neutral-400 mb-3 leading-relaxed">
            Want to know <span className="text-[#FF0050] font-semibold">your</span> TikTok account&apos;s true business value?
          </p>
          <CtaButton
            variant="gradient"
            icon={<ArrowRight className="h-4 w-4" />}
            onClick={() => {
              const input = document.querySelector<HTMLInputElement>('input[aria-label*="username"], input[placeholder*="username"]')
              if (input) { input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
            }}
          >
            Evaluate Your Account
          </CtaButton>
        </div>
      </div>
    </section>
  )
}
