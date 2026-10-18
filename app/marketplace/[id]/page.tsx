import { notFound } from 'next/navigation'
import { getServerDict } from '@/lib/i18n/server'
import { getListingById, toPublicListing } from '@/lib/marketplace-db'
import ListingDetailClient from '@/components/marketplace/ListingDetailClient'

export const dynamic = 'force-dynamic'

export default async function ListingPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ paid?: string; email?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const dict = getServerDict()
  const listing = await getListingById(id)
  if (!listing || listing.status === 'removed') notFound()
  return <ListingDetailClient
    listing={toPublicListing(listing)}
    paidReturn={sp.paid === 'success' ? { email: sp.email || '' } : undefined}
    dict={dict.marketplace}
  />
}
