'use client'
import { useState } from 'react'
import { getSessionToken } from '@/lib/credits-client'
import { TIER_COLORS } from '@/lib/tier'
import type { EnDict } from '@/lib/i18n/dictionaries/en'
import { Clock, Flag, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

interface PublicListing {
  id: string
  username: string
  askingPriceUsd: number
  description: string | null
  status: string
  niche?: string | null
  isSample?: boolean
  soldPriceUsd?: number | null
  pricePreviousUsd?: number | null
  viewCount?: number
  watcherCount?: number
  snapshot: {
    tier: string | null
    valuationUsd: number | null
    valuationLow: number | null
    valuationHigh: number | null
    followers: number | null
    engagementRate: number | null
    evaluatedAt: string | null
    avgPlays?: number | null
  }
}
type Dict = EnDict['marketplace']

// 市场页只做「展示 + 引流评估」：不提供下单、不卖联系方式。
// 因此详情页没有任何购买入口，唯一 CTA 是指向评估。
export default function ListingDetailClient({ listing, dict }: { listing: PublicListing; paidReturn?: { email: string }; dict: Dict }) {
  const [error, setError] = useState('')

  async function handleReport() {
    const token = getSessionToken()
    if (!token) { setError(dict.signInToReport); return }
    await fetch('/api/marketplace/report', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ listingId: listing.id }) })
    alert(dict.reportSubmitted)
  }

  const s = listing.snapshot
  const color = s.tier ? TIER_COLORS[s.tier] ?? '#fff' : '#fff'
  const deltaPct = listing.status !== 'sold' && s.valuationUsd
    ? Math.round(((listing.askingPriceUsd - s.valuationUsd) / s.valuationUsd) * 100)
    : null

  return (
    <main className="px-6 py-12 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold">@{listing.username}</h1>
        {s.tier && <span className="text-sm font-bold px-3 py-1 rounded-lg" style={{ color, border: `1px solid ${color}` }}>{s.tier}</span>}
      </div>
      {listing.status === 'sold' && (
        <div className="flex items-center gap-2 mb-6 px-4 py-3 rounded-xl border border-[#15803d] bg-[#15803d]/10 text-[#15803d] font-semibold text-sm">
          <CheckCircle2 size={16} />{dict.soldBanner}
          {listing.soldPriceUsd ? <span className="ml-auto text-white">— {dict.soldPriceLabel} ${listing.soldPriceUsd.toLocaleString()}</span> : null}
        </div>
      )}
      <div className="flex items-center gap-3 mb-6 text-xs text-neutral-500 flex-wrap">
        {listing.niche && <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400">{listing.niche}</span>}
        {s.avgPlays != null && <span>~{s.avgPlays.toLocaleString()} {dict.perVideo}</span>}
        {(listing.viewCount ?? 0) > 0 && <span>{listing.viewCount} views · {listing.watcherCount ?? 0} watching</span>}
        {listing.pricePreviousUsd ? <span className="text-[#fbbf24]">Price cut from ${listing.pricePreviousUsd.toLocaleString()}</span> : null}
      </div>
      <div className="grid grid-cols-3 gap-4 my-8">
        {[
          { label: dict.followers, value: (s.followers ?? 0).toLocaleString() },
          { label: dict.engagement, value: s.engagementRate != null ? `${s.engagementRate.toFixed(1)}%` : '—' },
          { label: dict.valuation, value: s.valuationLow != null && s.valuationHigh != null ? `$${s.valuationLow.toLocaleString()}–$${s.valuationHigh.toLocaleString()}` : s.valuationUsd != null ? `$${s.valuationUsd.toLocaleString()}` : '—' },
        ].map(k => (
          <div key={k.label} className="border border-neutral-800 rounded-xl p-4 bg-neutral-950">
            <div className="text-xs text-neutral-500 mb-1">{k.label}</div>
            <div className="text-xl font-bold">{k.value}</div>
          </div>
        ))}
      </div>
      {listing.description && <p className="text-neutral-300 mb-8 whitespace-pre-wrap">{listing.description}</p>}
      <div className="flex items-baseline gap-3 mb-8 flex-wrap">
        <span className="text-sm text-neutral-500">{listing.status === 'sold' ? dict.soldPriceLabel : dict.askPriceLabel}</span>
        <span className="text-4xl font-extrabold text-[#FF0050]">${(listing.status === 'sold' && listing.soldPriceUsd ? listing.soldPriceUsd : listing.askingPriceUsd).toLocaleString()}</span>
        {deltaPct != null && (
          <span className="text-xs text-neutral-400 px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800">
            {deltaPct > 0 ? '+' : '−'}{Math.abs(deltaPct)}% {dict.vsValuation}
          </span>
        )}
        <span className="text-sm text-neutral-500 flex items-center gap-1"><Clock size={14} />{dict.valuedAsOf} {s.evaluatedAt ? new Date(s.evaluatedAt).toLocaleDateString('en-US') : '—'}</span>
      </div>

      {/* 唯一转化出口：评估自己的账号 */}
      <div className="border border-neutral-800 rounded-2xl p-6 mb-8 bg-neutral-950 text-center">
        {listing.status === 'sold' ? (
          <p className="text-sm text-neutral-500 max-w-md mx-auto">{dict.detailSoldCta}</p>
        ) : (
          <>
            <p className="text-lg font-semibold mb-2">{dict.detailCtaTitle}</p>
            <p className="text-sm text-neutral-500 max-w-md mx-auto mb-5">{dict.detailCtaBody}</p>
          </>
        )}
        <Link href="/" className="inline-block bg-[#FF0050] hover:bg-[#e0004a] rounded-lg px-7 py-3 font-bold transition-colors">
          {dict.detailCtaButton}
        </Link>
        <p className="text-xs text-neutral-600 mt-3">{dict.detailCtaFootnote}</p>
      </div>

      <button onClick={handleReport} className="text-xs text-neutral-600 hover:text-neutral-400 flex items-center gap-1"><Flag size={12} />{dict.reportListing}</button>
      {error && <p className="text-xs text-[#FF0050] mt-2">{error}</p>}
      <p className="text-xs text-neutral-600 mt-8 border-t border-neutral-800 pt-4">{dict.disclaimer}</p>
    </main>
  )
}
