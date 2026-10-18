import { getServerDict } from '@/lib/i18n/server'
import SellClient from '@/components/marketplace/SellClient'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'List This Account for Sale | TokValue' }

export default function SellPage() {
  const dict = getServerDict()
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <SiteHeader />
      <SellClient dict={dict.marketplace} />
      <SiteFooter />
    </div>
  )
}
