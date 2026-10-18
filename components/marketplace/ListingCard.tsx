import Link from 'next/link'
import { Users, DollarSign } from 'lucide-react'
import { tierColor } from '@/lib/tier'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

interface Snapshot { tier: string | null; valuationLow: number | null; valuationHigh: number | null; valuationUsd: number | null; followers: number | null; evaluatedAt: string | null }
interface PublicItem { id: string; username: string; askingPriceUsd: number; snapshot: Snapshot; createdAt: string }

export default function ListingCard({ item, dict }: { item: PublicItem; dict: EnDict }) {
  const color = item.snapshot.tier ? tierColor(item.snapshot.tier) : ''
  const fmt = (n: number | null) => n == null ? '—' : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${n}`
  return (
    <Link href={`/marketplace/${item.id}`} className="block border border-neutral-800 rounded-2xl p-5 hover:border-neutral-600 transition-colors bg-neutral-950">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold truncate">@{item.username}</span>
        {item.snapshot.tier && (
          <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color, border: `1px solid ${color}` }}>{item.snapshot.tier}</span>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm text-neutral-400 mb-3">
        <span className="flex items-center gap-1"><Users size={14} />{(item.snapshot.followers ?? 0).toLocaleString()}</span>
        <span className="flex items-center gap-1"><DollarSign size={14} />{fmt(item.snapshot.valuationUsd)}</span>
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-neutral-800">
        <span className="text-lg font-bold text-[#FF0050]">${item.askingPriceUsd.toLocaleString()}</span>
        <span className="text-xs text-neutral-500">{dict.marketplace.valuedAsOf} {item.snapshot.evaluatedAt ? new Date(item.snapshot.evaluatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
      </div>
    </Link>
  )
}
