import Link from 'next/link'
import { getServerDict } from '@/lib/i18n/server'
import { listActiveListings, listNiches, toPublicListing, retryOnTransient } from '@/lib/marketplace-db'
import type { ListingRow, ListingSort, PriceBand } from '@/lib/marketplace-db'
import ListingCard from '@/components/marketplace/ListingCard'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'TikTok Account Marketplace | TokValue' }

const SORTS: ListingSort[] = ['latest', 'deal_desc', 'fresh', 'valuation_desc', 'valuation_asc', 'followers_desc']
const BANDS: PriceBand[] = ['lt1000', '1k-10k', '10k-50k', 'gt50k']

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ page?: string; sort?: string; status?: string; niche?: string; price?: string }> }) {
  const dict = getServerDict()
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1)
  const sort = (SORTS.includes(sp.sort as ListingSort) ? sp.sort : 'latest') as ListingSort
  const status = sp.status === 'sold' ? 'sold' : 'active'
  const niche = (sp.niche || '').trim() || null
  const price = (BANDS.includes(sp.price as PriceBand) ? sp.price : null) as PriceBand | null

  let rows: ListingRow[] = []
  let total = 0
  let niches: string[] = []
  try {
    niches = await retryOnTransient(() => listNiches())
    const res = await retryOnTransient(() => listActiveListings(page, 24, sort, status, { niche, priceBand: price }))
    rows = res.items
    total = res.total
  } catch {
    // DB 不可用时降级为空态，不向用户抛服务端错误
  }
  const publicItems = rows.map(l => toPublicListing(l))
  const now = Date.now()

  // 保留其余筛选条件的链接构造器
  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams()
    const next = { sort, status, niche: niche || '', price: price || '', page: '', ...patch } as Record<string, string>
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v)
    return `/marketplace?${q.toString()}`
  }

  const sortOptions: Array<{ value: ListingSort; label: string }> = [
    { value: 'latest', label: dict.marketplace.sortLatest },
    { value: 'deal_desc', label: dict.marketplace.sortDeal },
    { value: 'fresh', label: dict.marketplace.sortFresh },
    { value: 'valuation_desc', label: dict.marketplace.sortValuationDesc },
    { value: 'valuation_asc', label: dict.marketplace.sortValuationAsc },
    { value: 'followers_desc', label: dict.marketplace.sortFollowers },
  ]
  const bandLabels: Record<PriceBand, string> = {
    lt1000: dict.marketplace.priceBandLt1k, '1k-10k': dict.marketplace.priceBand1to10k,
    '10k-50k': dict.marketplace.priceBand10to50k, gt50k: dict.marketplace.priceBandGt50k,
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <SiteHeader />
      <main className="px-6 py-12 max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">{dict.marketplace.title}</h1>
        <p className="text-neutral-400 mb-1">{dict.marketplace.subtitle}</p>
        <p className="text-xs text-neutral-500 mb-6">{dict.marketplace.listingsCount.replace('{n}', String(total))}</p>

        {/* 在售 / 已售出 切换 + 卖账号 CTA */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex gap-2">
            {([['active', dict.marketplace.tabForSale], ['sold', dict.marketplace.tabSold]] as const).map(([v, label]) => (
              <Link key={v} href={href({ status: v, page: '' })}
                className={`px-5 py-2 rounded-full text-sm font-semibold border transition-colors ${status === v ? 'bg-[#00F2EA] text-black border-[#00F2EA]' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'}`}>
                {label}
              </Link>
            ))}
          </div>
          <Link href="/sell"
            className="bg-[#FF0050] hover:bg-[#e0004a] rounded-full px-5 py-2 text-sm font-bold transition-colors whitespace-nowrap">
            {dict.marketplace.sellYourAccount}
          </Link>
        </div>

        {/* 排序 */}
        <div className="flex gap-2 mb-3 flex-wrap">
          {sortOptions.map(o => (
            <Link key={o.value} href={href({ sort: o.value, page: '' })}
              className={`px-4 py-1.5 rounded-full text-sm border ${sort === o.value ? 'border-[#00F2EA] text-[#00F2EA]' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'}`}>
              {o.label}
            </Link>
          ))}
        </div>

        {/* 筛选：赛道 + 价格带 */}
        {(niches.length > 0 || status === 'active') && (
          <div className="flex items-center gap-2 mb-8 flex-wrap text-sm">
            <span className="text-xs uppercase tracking-wide text-neutral-500 mr-1">{dict.marketplace.filterNiche}</span>
            <Link href={href({ niche: null, page: '' })}
              className={`px-3 py-1 rounded-full border text-xs ${!niche ? 'border-neutral-500 text-white' : 'border-neutral-800 text-neutral-500 hover:border-neutral-600'}`}>
              {dict.marketplace.filterAllNiches}
            </Link>
            {niches.slice(0, 12).map(n => (
              <Link key={n} href={href({ niche: n, page: '' })}
                className={`px-3 py-1 rounded-full border text-xs ${niche === n ? 'border-[#00F2EA] text-[#00F2EA]' : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'}`}>
                {n}
              </Link>
            ))}
            <span className="w-px h-4 bg-neutral-800 mx-1" />
            {BANDS.map(b => (
              <Link key={b} href={href({ price: price === b ? null : b, page: '' })}
                className={`px-3 py-1 rounded-full border text-xs ${price === b ? 'border-[#FF0050] text-[#FF0050]' : 'border-neutral-800 text-neutral-400 hover:border-neutral-600'}`}>
                {bandLabels[b]}
              </Link>
            ))}
            {(niche || price) && (
              <Link href={href({ niche: null, price: null, page: '' })} className="text-xs text-neutral-500 underline hover:text-neutral-300 ml-1">
                {dict.marketplace.clearFilters}
              </Link>
            )}
          </div>
        )}

        {publicItems.length === 0 ? (
          <div className="text-center py-24 text-neutral-500 border border-dashed border-neutral-800 rounded-2xl">
            {niche || price ? dict.marketplace.emptyFiltered : status === 'sold' ? dict.marketplace.noSoldListings : dict.marketplace.noListings}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {publicItems.map(item => <ListingCard key={item.id} item={item} dict={dict} now={now} />)}
          </div>
        )}

        {total > 24 && (
          <div className="flex justify-center gap-4 mt-12">
            {page > 1 && <Link href={href({ page: String(page - 1) })} className="text-[#00F2EA]">{dict.marketplace.prevPage}</Link>}
            {page * 24 < total && <Link href={href({ page: String(page + 1) })} className="text-[#00F2EA]">{dict.marketplace.nextPage}</Link>}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
