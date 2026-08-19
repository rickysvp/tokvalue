'use client'

import { useState, useEffect } from 'react'
import { Quote, BadgeCheck } from 'lucide-react'
import type { EnDict } from '@/lib/i18n/dictionaries/en'
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

/** 地区 → 评价语言：CN/TW 用中文，JP 用日文，其余英文 */
function langForRegion(region: string | null): 'en' | 'zh' | 'ja' {
  const r = (region || '').toUpperCase()
  if (r === 'CN' || r === 'TW' || r === 'HK' || r === 'MO' || r === 'SG') return 'zh'
  if (r === 'JP') return 'ja'
  return 'en'
}

/** 稳定字符串 hash（同一账号永远同一文案） */
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

/** 从池中取文案：hash 分配 + 与上一条不同（去重） */
function pickQuote(pool: readonly string[], username: string, prev: string | null): string {
  let q = pool[hashStr(username) % pool.length]
  if (prev && q === prev) q = pool[(hashStr(username) + 1) % pool.length]
  return q
}

/** 真实评估账号 + 轮换评价文案的评价卡 */
function TestimonialCard({ acc, quote }: { acc: RecentEvaluation; quote: string }) {
  const color = TIER_COLORS[acc.tier] || '#FF0050'
  return (
    <figure className="mx-2.5 flex w-[330px] shrink-0 flex-col rounded-2xl border border-[#1F1D26] bg-[#0E0E14] p-5 transition-colors duration-300 hover:border-[#FF0050]/40">
      {/* identity — 真实评估账号数据 */}
      <figcaption className="flex items-center gap-3 mb-4">
        <div className="relative h-10 w-10 shrink-0">
          {acc.avatarData || acc.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={acc.avatarData || acc.avatar || undefined}
              alt={acc.nickname}
              className="h-10 w-10 rounded-full border-2 object-cover"
              style={{ borderColor: `${color}55` }}
            />
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold text-neutral-300"
              style={{ borderColor: `${color}55`, backgroundColor: '#1a1a1a' }}
            >
              {acc.nickname.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-white">{acc.nickname}</span>
            {acc.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[#00F2EA]" />}
          </div>
          <div className="truncate text-xs text-neutral-500">@{acc.username}</div>
        </div>
        <div
          className="ml-auto flex h-8 shrink-0 items-center justify-center rounded-full border px-2 text-[10px] font-extrabold"
          style={{ borderColor: `${color}66`, color }}
        >
          {valueTierOf(acc.tier).replace(' Value', '')}
        </div>
      </figcaption>

      {/* quote */}
      <blockquote className="flex-1 text-[13px] leading-relaxed text-neutral-300">“{quote}”</blockquote>

      {/* 真实估值 + 粉丝数 */}
      <div className="mt-4 flex items-center justify-between border-t border-[#1F1D26] pt-3">
        <span className="text-sm font-bold text-white tabular-nums">{fmtUsd(acc.businessValueHigh)}</span>
        <span className="text-[11px] text-neutral-500">{fmt(acc.followerCount)} followers</span>
      </div>
    </figure>
  )
}

export function Testimonials({ dict }: { dict: EnDict }) {
  const t = dict.home.testimonials
  const [items, setItems] = useState<RecentEvaluation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/recent-evaluations', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data?.evaluations?.length) setItems(data.evaluations)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 无真实数据时不渲染模块（不展示虚拟账号）
  if (!loading && items.length === 0) return null

  const quotes = t.quotes
  /** 为一行账号顺序分配文案：按 region 选语言池 + 相邻去重 */
  const assignQuotes = (row: RecentEvaluation[]): Map<string, string> => {
    const map = new Map<string, string>()
    let prev: string | null = null
    for (const acc of row) {
      const pool = quotes[langForRegion(acc.region)]
      const q = pickQuote(pool, acc.username, prev)
      map.set(acc.username, q)
      prev = q
    }
    return map
  }

  const mid = Math.ceil((loading ? 12 : items.length) / 2)
  const all = loading
    ? Array.from({ length: 12 }).map((_, i) => ({ _skel: i } as unknown as RecentEvaluation))
    : items
  const row1 = all.slice(0, mid)
  const row2 = all.slice(mid)

  const quotes1 = loading ? new Map<string, string>() : assignQuotes(row1)
  const quotes2 = loading ? new Map<string, string>() : assignQuotes(row2)

  const tripledRow1 = [...row1, ...row1, ...row1]
  const tripledRow2 = [...row2, ...row2, ...row2]

  return (
    <section className="overflow-hidden py-20">
      <div className="mx-auto max-w-5xl px-4">
        {/* header */}
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-4 py-1.5 text-xs font-medium text-[#00F2EA]">
            <Quote className="h-3.5 w-3.5" />
            {t.badge}
          </div>
          <h2 className="mb-3 text-2xl font-bold">{t.title}</h2>
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-neutral-400">{t.subtitle}</p>
        </div>
      </div>

      {/* Row 1 — left drift, slower */}
      <div className="relative overflow-hidden">
        <div className="flex w-max animate-marquee-slow">
          {tripledRow1.map((acc, i) =>
            loading ? (
              <div key={`s1-${i}`} className="mx-2.5 h-40 w-[330px] shrink-0 animate-pulse rounded-2xl bg-neutral-800/60" />
            ) : (
              <TestimonialCard key={`${acc.username}-${i}`} acc={acc} quote={quotes1.get(acc.username) || ''} />
            )
          )}
        </div>
      </div>
      {/* Row 2 — left drift, faster (offset for depth) */}
      <div className="relative mt-4 overflow-hidden">
        <div className="flex w-max animate-marquee">
          {tripledRow2.map((acc, i) =>
            loading ? (
              <div key={`s2-${i}`} className="mx-2.5 h-40 w-[330px] shrink-0 animate-pulse rounded-2xl bg-neutral-800/60" />
            ) : (
              <TestimonialCard key={`${acc.username}-${i}`} acc={acc} quote={quotes2.get(acc.username) || ''} />
            )
          )}
        </div>
      </div>
    </section>
  )
}

export default Testimonials
