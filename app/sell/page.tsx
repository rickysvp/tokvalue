import { getServerDict } from '@/lib/i18n/server'
import SellClient from '@/components/marketplace/SellClient'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { getMarketplaceStats, retryOnTransient } from '@/lib/marketplace-db'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'List This Account for Sale | TokValue' }

export default async function SellPage() {
  const dict = getServerDict()
  // 社会证明数字全部取自库中真实成交；取不到则传 null，由前端隐藏对应格子
  let stats = { active: 0, sold: 0, medianDiscountPct: null as number | null, medianDaysToSell: null as number | null }
  try { stats = await retryOnTransient(() => getMarketplaceStats()) } catch { /* DB 不可用时仍可进入挂牌页 */ }
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <SiteHeader />
      <SellClient dict={dict.marketplace} stats={stats} />
      <SiteFooter />
    </div>
  )
}
