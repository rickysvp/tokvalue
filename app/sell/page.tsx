import { getServerDict } from '@/lib/i18n/server'
import SellClient from '@/components/marketplace/SellClient'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'List This Account for Sale | TokValue' }

export default function SellPage() {
  const dict = getServerDict()
  return <SellClient dict={dict.marketplace} />
}
