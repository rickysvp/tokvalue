'use client'

import { Globe, Users, BarChart3 } from 'lucide-react'

interface SocialProofStats {
  accountsEvaluated: number
  totalValueAssessed: number
  uniqueVisitors: number
}

interface SocialProofBarProps {
  stats: SocialProofStats
}

export function SocialProofBar({ stats }: SocialProofBarProps) {
  // Don't render anything if API hasn't returned real data
  if (stats.accountsEvaluated === 0 && stats.totalValueAssessed === 0 && stats.uniqueVisitors === 0) {
    return null
  }

  const formatValue = (n: number): string => {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B+`
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M+`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K+`
    return `${n}+`
  }

  const formatCurrency = (n: number): string => {
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B+`
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M+`
    return `$${n.toLocaleString()}+`
  }

  const items = [
    {
      icon: BarChart3,
      value: formatValue(stats.accountsEvaluated),
      label: 'Accounts Evaluated',
    },
    {
      icon: Globe,
      value: formatCurrency(stats.totalValueAssessed),
      label: 'Total Value Assessed',
    },
    {
      icon: Users,
      value: formatValue(stats.uniqueVisitors),
      label: 'Active Users',
    },
  ]

  return (
    <section className="py-16">
      <div className="mx-auto max-w-5xl px-4">
        <p className="text-center text-sm text-neutral-500 mb-8">
          Trusted by creators, brands &amp; agencies worldwide
        </p>
        <div className="grid grid-cols-3 gap-8 text-center max-w-xl mx-auto">
          {items.map((item, i) => {
            const Icon = item.icon
            return (
              <div key={i}>
                <Icon className="h-5 w-5 text-[#00F2EA] mx-auto mb-3" />
                <div className="text-2xl sm:text-3xl font-black text-white tabular-nums mb-1">
                  {item.value}
                </div>
                <div className="text-xs text-neutral-500">{item.label}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
