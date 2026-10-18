import Link from 'next/link'
import { getServerDict } from '@/lib/i18n/server'
import { listActiveListings, toPublicListing } from '@/lib/marketplace-db'
import type { ListingRow, ListingSort } from '@/lib/marketplace-db'
import ListingCard from '@/components/marketplace/ListingCard'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'TikTok Account Marketplace | TokValue' }

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ page?: string; sort?: string; status?: string }> }) {
  const dict = getServerDict()
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1)
  const sort = (['latest', 'valuation_desc', 'valuation_asc', 'followers_desc'].includes(sp.sort || '') ? sp.sort : 'latest') as ListingSort
  const status = sp.status === 'sold' ? 'sold' : 'active'

  let rows: ListingRow[] = []
  let total = 0
  try {
    const res = await listActiveListings(page, 24, sort, status)
    rows = res.items
    total = res.total
  } catch {
    // DB 不可用时降级为空态，不向用户抛服务端错误
  }
  const publicItems = rows.map(l => toPublicListing(l))

  const sortOptions: Array<{ value: ListingSort; label: string }> = [
    { value: 'latest', label: dict.marketplace.sortLatest },
    { value: 'valuation_desc', label: dict.marketplace.sortValuationDesc },
    { value: 'valuation_asc', label: dict.marketplace.sortValuationAsc },
    { value: 'followers_desc', label: dict.marketplace.sortFollowers },
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <SiteHeader />
      <main className="px-6 py-12 max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">{dict.marketplace.title}</h1>
        <p className="text-neutral-400 mb-6">{dict.marketplace.subtitle}</p>

        {/* 在售 / 已售出 切换 */}
        <div className="flex gap-2 mb-4">
          {([['active', dict.marketplace.tabForSale], ['sold', dict.marketplace.tabSold]] as const).map(([v, label]) => (
            <Link key={v} href={`/marketplace?status=${v}&sort=${sort}`}
              className={`px-5 py-2 rounded-full text-sm font-semibold border transition-colors ${status === v ? 'bg-[#00F2EA] text-black border-[#00F2EA]' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'}`}>
              {label}
            </Link>
          ))}
        </div>

        <div className="flex gap-2 mb-8 flex-wrap">
          {sortOptions.map(o => (
            <Link key={o.value} href={`/marketplace?sort=${o.value}&status=${status}`}
              className={`px-4 py-1.5 rounded-full text-sm border ${sort === o.value ? 'border-[#00F2EA] text-[#00F2EA]' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'}`}>
              {o.label}
            </Link>
          ))}
        </div>

        {publicItems.length === 0 ? (
          <div className="text-center py-24 text-neutral-500 border border-dashed border-neutral-800 rounded-2xl">
            {status === 'sold' ? dict.marketplace.noSoldListings : dict.marketplace.noListings}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {publicItems.map(item => <ListingCard key={item.id} item={item} dict={dict} />)}
          </div>
        )}

        {total > 24 && (
          <div className="flex justify-center gap-4 mt-12">
            {page > 1 && <Link href={`/marketplace?page=${page - 1}&sort=${sort}&status=${status}`} className="text-[#00F2EA]">{dict.marketplace.prevPage}</Link>}
            <Link href={`/marketplace?page=${page + 1}&sort=${sort}&status=${status}`} className="text-[#00F2EA]">{dict.marketplace.nextPage}</Link>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
