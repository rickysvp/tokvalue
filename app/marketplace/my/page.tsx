'use client'
// My Listings / My Unlocks 管理页（Task 12）。
// 登录态：session token 仅存 localStorage（无 cookie，见 lib/credits-client.ts），
// 故按计划前置确认采用 Client Component 方案：getSessionToken() +
// fetch('/api/marketplace/listings?mine=1') + fetch('/api/marketplace/my-unlocks')。
// 无 token / 401 → redirect('/') 引导回首页登录（与计划服务端版行为一致）。
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Users, DollarSign } from 'lucide-react'
import { getSessionToken } from '@/lib/credits-client'
import { getServerDict } from '@/lib/i18n/server'
import { tierColor } from '@/lib/tier'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import type { ListingStatus } from '@/lib/marketplace'

const dict = getServerDict()

interface Snapshot {
  tier: string | null
  valuationLow: number | null
  valuationHigh: number | null
  valuationUsd: number | null
  followers: number | null
  evaluatedAt: string | null
}
interface MyListing {
  id: string
  username: string
  askingPriceUsd: number
  description: string | null
  status: ListingStatus
  snapshot: Snapshot
  createdAt: string
}
interface MyUnlock {
  listingId: string
  username: string
  contactEmail: string
  socialType: string | null
  socialHandle: string | null
  createdAt: string
}

const STATUS_GROUPS: Array<{ status: ListingStatus; label: string }> = [
  { status: 'active', label: dict.marketplace.statusActive },
  { status: 'sold', label: dict.marketplace.statusSold },
  { status: 'withdrawn', label: dict.marketplace.statusWithdrawn },
  { status: 'removed', label: dict.marketplace.statusRemoved },
]

export default function MyMarketplacePage() {
  const router = useRouter()
  const [listings, setListings] = useState<MyListing[] | null>(null)
  const [unlocks, setUnlocks] = useState<MyUnlock[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const token = getSessionToken()
    if (!token) { router.replace('/'); return }
    const headers = { Authorization: `Bearer ${token}` }
    const [lres, ures] = await Promise.all([
      fetch('/api/marketplace/listings?mine=1', { headers }),
      fetch('/api/marketplace/my-unlocks', { headers }),
    ])
    if (lres.status === 401 || ures.status === 401) { router.replace('/'); return }
    const ldata = lres.ok ? await lres.json() : { items: [] }
    const udata = ures.ok ? await ures.json() : { items: [] }
    setListings(ldata.items as MyListing[])
    setUnlocks(udata.items as MyUnlock[])
  }, [router])

  useEffect(() => { load() }, [load])

  async function act(id: string, action: 'withdraw' | 'mark_sold') {
    const token = getSessionToken()
    if (!token) return
    setBusy(`${id}:${action}`)
    setError('')
    try {
      const res = await fetch(`/api/marketplace/listings/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) { setError(dict.marketplace.updateFailed); return }
      const data = await res.json()
      setListings(ls => (ls ? ls.map(l => (l.id === id ? (data.listing as MyListing) : l)) : ls))
    } catch {
      setError(dict.marketplace.updateFailed)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <SiteHeader />
      <main className="px-6 py-12 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">{dict.marketplace.myListings}</h1>

      {listings === null ? (
        <p className="text-neutral-500 mb-12">{dict.marketplace.loading}</p>
      ) : listings.length === 0 ? (
        <p className="text-neutral-500 mb-12">{dict.marketplace.noListingsYet}</p>
      ) : (
        <div className="space-y-8 mb-16">
          {error && <p className="text-sm text-[#FF0050]">{error}</p>}
          {STATUS_GROUPS.map(group => {
            const items = listings.filter(l => l.status === group.status)
            if (items.length === 0) return null
            return (
              <section key={group.status}>
                <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3">{group.label}</h3>
                <div className="space-y-3">
                  {items.map(l => {
                    const color = l.snapshot.tier ? tierColor(l.snapshot.tier) : ''
                    return (
                      <div key={l.id} className="flex items-center justify-between gap-3 border border-neutral-800 rounded-xl p-4 hover:border-neutral-600 transition-colors">
                        <Link href={`/marketplace/${l.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="font-semibold truncate">@{l.username}</span>
                          {l.snapshot.tier && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded shrink-0" style={{ color, border: `1px solid ${color}` }}>{l.snapshot.tier}</span>
                          )}
                          <span className="text-sm text-neutral-400 shrink-0 flex items-center gap-1">
                            <Users size={13} className="text-neutral-500" />{(l.snapshot.followers ?? 0).toLocaleString()}
                          </span>
                          <span className="text-sm text-neutral-400 shrink-0 flex items-center gap-1">
                            <DollarSign size={13} className="text-neutral-500" />{l.snapshot.valuationUsd?.toLocaleString() ?? '—'}
                          </span>
                        </Link>
                        <span className="text-lg font-bold text-[#FF0050] shrink-0">${l.askingPriceUsd.toLocaleString()}</span>
                        <span className={`text-xs px-2 py-1 rounded shrink-0 ${l.status === 'active' ? 'text-[#00F2EA] border border-[#00F2EA]/40' : 'text-neutral-500 border border-neutral-700'}`}>
                          {STATUS_GROUPS.find(g => g.status === l.status)?.label ?? l.status}
                        </span>
                        {l.status === 'active' && (
                          <span className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => act(l.id, 'mark_sold')}
                              disabled={busy !== null}
                              className="text-xs px-2.5 py-1 rounded border border-neutral-700 text-neutral-300 hover:border-[#00F2EA] hover:text-[#00F2EA] disabled:opacity-40 transition-colors"
                            >
                              {dict.marketplace.markSold}
                            </button>
                            <button
                              onClick={() => act(l.id, 'withdraw')}
                              disabled={busy !== null}
                              className="text-xs px-2.5 py-1 rounded border border-neutral-700 text-neutral-300 hover:border-[#FF0050] hover:text-[#FF0050] disabled:opacity-40 transition-colors"
                            >
                              {busy === `${l.id}:withdraw` ? dict.marketplace.loading : dict.marketplace.withdraw}
                            </button>
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <h2 className="text-2xl font-bold mb-6">{dict.marketplace.myUnlocks}</h2>
      {unlocks === null ? (
        <p className="text-neutral-500">{dict.marketplace.loading}</p>
      ) : unlocks.length === 0 ? (
        <p className="text-neutral-500">{dict.marketplace.noUnlocksYet}</p>
      ) : (
        <div className="space-y-3">
          {unlocks.map(u => (
            <div key={u.listingId} className="flex items-center justify-between gap-3 border border-neutral-800 rounded-xl p-4 hover:border-neutral-600 transition-colors">
              <Link href={`/marketplace/${u.listingId}`} className="font-semibold truncate shrink-0">@{u.username}</Link>
              <div className="text-right min-w-0">
                <span className="text-sm text-[#00F2EA] break-all">{u.contactEmail}</span>
                {u.socialType && u.socialHandle && (
                  <p className="text-xs text-neutral-400">{u.socialType}: {u.socialHandle}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </main>
      <SiteFooter />
    </div>
  )
}
