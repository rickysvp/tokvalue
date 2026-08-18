'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { Zap, Lightbulb, BookOpen, Loader2, Mail } from 'lucide-react'
import { getActiveEmail, getSessionToken } from '@/lib/credits-client'
import { getServerDict } from '@/lib/i18n/server'
import { UserMenu } from '@/components/UserMenu'
import { ReferralCta } from '@/components/ReferralCta'

const dict = getServerDict()

interface CreditBalance {
  email: string
  credits: number
}

export function SiteHeader() {
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  useEffect(() => {
    const email = getActiveEmail()
    const token = getSessionToken()
    if (email && token) {
      setBalanceLoading(true)
      fetch('/api/credits/balance', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then((data: CreditBalance | null) => { if (data) { setCreditBalance(data) } setBalanceLoading(false) })
        .catch(() => setBalanceLoading(false))
    }
  }, [])

  const handleSignOut = () => {
    import('@/lib/credits-client').then(m => {
      m.setActiveEmail(null)
      m.setSessionToken(null)
    })
    setCreditBalance(null)
  }

  return (
    <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl">
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#00F2EA]/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent to-[#00F2EA]/[0.03] pointer-events-none" />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="group shrink-0">
          <Image src="/tokvalue.png" alt="TokValue" width={160} height={40} className="h-10 w-auto object-contain" />
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center justify-center gap-1 flex-1">
          {[
            { label: dict.nav.pricing, href: '/#pricing', icon: Zap },
            { label: dict.nav.howItWorks, href: '/#capabilities', icon: Lightbulb },
          ].map(item => (
            <a
              key={item.label}
              href={item.href}
              className="group relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-neutral-400 hover:text-white transition-colors"
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
              <span className="absolute inset-x-2 -bottom-0.5 h-px bg-gradient-to-r from-transparent via-[#00F2EA]/60 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform" />
            </a>
          ))}
          <Link
            href="/blog"
            className="group relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-neutral-400 hover:text-white transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {dict.nav.blog}
            <span className="absolute inset-x-2 -bottom-0.5 h-px bg-gradient-to-r from-transparent via-[#00F2EA]/60 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform" />
          </Link>
        </nav>

        {/* Right side */}
        <div className="flex items-center justify-end gap-2 min-w-0">
          <ReferralCta />
          {balanceLoading && !creditBalance ? (
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="hidden sm:inline">{dict.nav.loadingCredits}</span>
            </div>
          ) : creditBalance ? (
            <>
              <div className="group relative hidden sm:block">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-[#00F2EA]/40 to-[#FF0050]/30 rounded-full blur-sm opacity-60 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center gap-1.5 rounded-full border border-[#00F2EA]/40 bg-[#0a0a0a] px-3 py-1">
                  <Zap className="h-3 w-3 text-[#00F2EA]" fill="#00F2EA" />
                  <span className="text-xs font-bold text-[#00F2EA] tabular-nums">{creditBalance.credits}</span>
                  <span className="text-[10px] text-neutral-500">{dict.common.evaluations}</span>
                </div>
              </div>

              <div className="hidden sm:block">
                <UserMenu email={creditBalance.email} onSwitchAccount={handleSignOut} />
              </div>
            </>
          ) : (
            <Link
              href="/?verify=1"
              className="group relative overflow-hidden rounded-full bg-gradient-to-r from-[#FF0050] to-[#ff2d6a] px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-[#FF0050]/20 hover:shadow-xl hover:shadow-[#FF0050]/30 transition-all"
            >
              <span className="relative z-10 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {dict.nav.verifyEmail}
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
