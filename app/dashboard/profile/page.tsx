'use client'
import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard-v2/DashboardShell'
import { AccountCard } from '@/components/dashboard-v2/profile/AccountCard'
import { CreditsBillingCard } from '@/components/dashboard-v2/profile/CreditsBillingCard'
import { PreferencesToggle } from '@/components/dashboard-v2/profile/PreferencesToggle'
import { DangerZone } from '@/components/dashboard-v2/profile/DangerZone'
import { useDashboardData } from '@/components/dashboard/dashboard-data'
import { setActiveEmail, setSessionToken } from '@/lib/credits-client'
import { trackEvent } from '@/lib/track-client'

export default function DashboardProfilePage() {
  useEffect(() => {
    trackEvent('dashboard_viewed', { page: 'profile' })
  }, [])
  const router = useRouter()
  const data = useDashboardData()
  const balance = data.balance
  const latest = data.latest

  const email = balance?.email ?? ''
  const nickname = latest?.nickname ?? email.split('@')[0] ?? 'there'
  const user = { name: nickname, email }

  const signedUpAt = balance?.verifiedAt
  const signedUpLabel = signedUpAt
    ? `Joined ${new Date(signedUpAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
    : ''

  const remaining = balance?.credits ?? 0
  const lastPurchase = balance?.purchases?.[0]
  const usedOfPack = lastPurchase != null ? Math.max(0, (lastPurchase.credits ?? 0) - Math.min(remaining, lastPurchase.credits ?? 0)) : undefined
  const packLabel = lastPurchase
    ? lastPurchase.packageId === 'pack1'
      ? '$9 single pack'
      : lastPurchase.packageId === 'pack6'
        ? '$29 Growth pack'
        : lastPurchase.packageId === 'pack30'
          ? '$99 Studio pack'
          : `${lastPurchase.credits}-pack`
    : undefined

  function handleSignOut() {
    setActiveEmail(null)
    setSessionToken(null)
    router.replace('/')
  }

  return (
    <DashboardShell page="profile" user={user}>
      <div className="max-w-[680px] mx-auto flex flex-col gap-4">
        <AccountCard
          user={{
            name: nickname,
            email,
            signedUpLabel,
            avatarInitial: nickname.charAt(0).toUpperCase(),
          }}
        />
        <CreditsBillingCard
          credits={{ remaining, usedOfPack, packLabel }}
        />
        <PreferencesToggle />
        <DangerZone onSignOut={handleSignOut} />
      </div>
    </DashboardShell>
  )
}
