import Link from 'next/link'
import { Users, Heart, Play, Scale, Eye, Bookmark } from 'lucide-react'
import { tierColor } from '@/lib/tier'
import { maskUsername } from '@/lib/marketplace'
import { TIER_ER_BENCHMARK } from '@/lib/scoring/config'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

interface Snapshot {
  tier: string | null; valuationLow: number | null; valuationHigh: number | null; valuationUsd: number | null
  followers: number | null; engagementRate?: number | null; evaluatedAt: string | null; avgPlays?: number | null
}
interface PublicItem {
  id: string; username: string; askingPriceUsd: number; status: string; snapshot: Snapshot; createdAt: string
  niche?: string | null; isSample?: boolean; soldPriceUsd?: number | null
  pricePreviousUsd?: number | null; priceChangedAt?: string | null; viewCount?: number; watcherCount?: number
}

const DAY = 86_400_000

// 粉丝层级 → 互动率基准（与估值引擎同一口径）
export function followerTierOf(followers: number | null): 'nano' | 'micro' | 'mid' | 'macro' | 'mega' {
  const f = followers ?? 0
  return f < 10_000 ? 'nano' : f < 100_000 ? 'micro' : f < 500_000 ? 'mid' : f < 1_000_000 ? 'macro' : 'mega'
}

function money(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n}`
}

function compact(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`.replace('.0K', 'K')
  return String(n)
}

// now 由服务端传入：卡片内不做 Date.now()，避免 SSR 与客户端 hydrate 时日期不同导致错配
export default function ListingCard({ item, dict, now }: { item: PublicItem; dict: EnDict; now: number }) {
  const sold = item.status === 'sold'
  const color = item.snapshot.tier ? tierColor(item.snapshot.tier) : ''
  const range = item.snapshot.valuationLow != null && item.snapshot.valuationHigh != null
    ? `${money(item.snapshot.valuationLow)}–${money(item.snapshot.valuationHigh)}`
    : money(item.snapshot.valuationUsd)

  // 互动率相对层级基准的位置：>1.3 好、0.9–1.3 正常、<0.9 偏弱
  const ftier = followerTierOf(item.snapshot.followers)
  const er = item.snapshot.engagementRate
  const erRatio = er != null ? er / TIER_ER_BENCHMARK[ftier] : null
  const erClass = erRatio == null ? 'text-neutral-400' : erRatio >= 1.3 ? 'text-[#34d399]' : erRatio < 0.9 ? 'text-[#fbbf24]' : 'text-neutral-300'

  // 叫价相对估值中值的折让/溢价
  const mid = item.snapshot.valuationUsd
  const delta = mid ? Math.round(((item.askingPriceUsd - mid) / mid) * 100) : null
  const days = Math.max(0, Math.floor((now - new Date(item.createdAt).getTime()) / DAY))
  const staleDays = item.snapshot.evaluatedAt ? Math.floor((now - new Date(item.snapshot.evaluatedAt).getTime()) / DAY) : null

  return (
    <Link href={`/marketplace/${item.id}`}
      className={`group block border border-neutral-800 rounded-2xl p-5 hover:border-neutral-600 transition-colors bg-neutral-950 ${sold ? 'opacity-70' : ''}`}>
      {/* 第一层：账号 · 赛道 · 评级 */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="font-semibold truncate">@{maskUsername(item.username)}</div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            {item.niche && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-400 border border-neutral-800">{item.niche}</span>
            )}
          </div>
        </div>
        <span className="flex items-center gap-2 shrink-0">
          {sold && <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#15803d] text-white">{dict.marketplace.soldBadge}</span>}
          {item.snapshot.tier && (
            <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color, border: `1px solid ${color}` }}>{item.snapshot.tier}</span>
          )}
        </span>
      </div>

      {/* 第二层：可比数据 —— 粉丝 / 互动率（带基准）/ 播放 / 估值 */}
      <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-sm mb-3">
        <span className="flex items-center gap-1.5 text-neutral-300"><Users size={13} className="text-neutral-500" />{compact(item.snapshot.followers)}</span>
        <span className={`flex items-center gap-1.5 ${erClass}`} title={erRatio != null ? `${erRatio.toFixed(2)}x ${ftier} benchmark (${TIER_ER_BENCHMARK[ftier]}%)` : undefined}>
          <Heart size={13} className="opacity-70" />{er != null ? `${er.toFixed(1)}%` : '—'}
          {erRatio != null && <span className="text-[11px] opacity-80">({erRatio.toFixed(1)}x)</span>}
        </span>
        <span className="flex items-center gap-1.5 text-neutral-300"><Play size={13} className="text-neutral-500" />{compact(item.snapshot.avgPlays ?? null)} {dict.marketplace.perVideo}</span>
        <span className="flex items-center gap-1.5 text-neutral-300"><Scale size={13} className="text-neutral-500" />{range}</span>
      </div>

      {/* 第三层：价格 + 折让 + 挂牌天数 */}
      <div className="pt-3 border-t border-neutral-800">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">{sold ? dict.marketplace.soldPriceLabel : dict.marketplace.askPriceLabel}</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-[#FF0050]">{money(sold && item.soldPriceUsd ? item.soldPriceUsd : item.askingPriceUsd)}</span>
              {delta != null && !sold && (
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${delta <= -15 ? 'bg-[#15803d]/20 text-[#4ade80]' : 'bg-neutral-900 text-neutral-400'}`}>
                  {delta > 0 ? '+' : '−'}{Math.abs(delta)}% {dict.marketplace.vsValuation}
                </span>
              )}
            </div>
          </div>
          <span className="text-xs text-neutral-500">{days}{dict.marketplace.daysOnMarket}</span>
        </div>
        <div className="flex items-center gap-3 mt-2 text-[11px] text-neutral-500">
          <span className="flex items-center gap-1"><Eye size={11} />{item.viewCount ?? 0}</span>
          <span className="flex items-center gap-1"><Bookmark size={11} />{item.watcherCount ?? 0}</span>
          <span className="ml-auto">
            {staleDays != null && staleDays > 60 ? (
              <span className="text-[#fbbf24]">{dict.marketplace.staleValuation} · {staleDays}d</span>
            ) : (
              <span>{dict.marketplace.valuedDaysAgo.replace('{n}', String(staleDays ?? 0))}</span>
            )}
          </span>
        </div>
      </div>
    </Link>
  )
}
