'use client'

import { Globe, Users, BarChart3, DollarSign, TrendingUp } from 'lucide-react'

interface SocialProofStats {
  accountsEvaluated: number
  totalValueAssessed: number
  visitors: number
  totalFollowers?: number
  countriesReached?: number
}

interface SocialProofBarProps {
  stats: SocialProofStats
}

export function SocialProofBar({ stats }: SocialProofBarProps) {
  // Don't render anything if API hasn't returned real data
  if (
    stats.accountsEvaluated === 0 &&
    stats.totalValueAssessed === 0 &&
    stats.visitors === 0 &&
    (stats.totalFollowers ?? 0) === 0
  ) {
    return null
  }

  // 一律向下取整再配 "+"：1376 显示 1.3K+ 而不是 1.4K+，避免把真实数字往上抬
  const floor1 = (n: number) => Math.floor(n * 10) / 10

  const formatValue = (n: number): string => {
    if (n >= 1_000_000_000) return `${floor1(n / 1_000_000_000)}B+`
    if (n >= 1_000_000) return `${floor1(n / 1_000_000)}M+`
    if (n >= 1_000) return `${floor1(n / 1_000)}K+`
    return String(n)
  }

  const formatCurrency = (n: number): string => {
    if (n >= 1_000_000_000) return `$${floor1(n / 1_000_000_000)}B+`
    if (n >= 1_000_000) return `$${floor1(n / 1_000_000)}M+`
    if (n >= 1_000) return `$${n.toLocaleString('en-US')}+`
    return `$${n.toLocaleString('en-US')}`
  }

  const countries = stats.countriesReached ?? 0
  const items = [
    {
      icon: TrendingUp,
      value: formatValue(stats.visitors),
      label: 'Users',
    },
    {
      icon: BarChart3,
      value: formatValue(stats.accountsEvaluated),
      label: 'Accounts Evaluated',
    },
    ...(countries > 0
      ? [{
          icon: Globe,
          value: String(countries),
          label: 'Countries Covered',
        }]
      : []),
    {
      icon: Users,
      value: formatValue(stats.totalFollowers ?? 0),
      label: 'Audience Reach',
    },
    {
      icon: DollarSign,
      value: formatCurrency(stats.totalValueAssessed),
      label: 'Creator Value Assessed',
    },
  ]

  return (
    <section className="py-16">
      <div className="mx-auto max-w-5xl px-4">
        <p className="text-center text-sm text-neutral-500 mb-8">
          Trusted by creators, brands &amp; agencies worldwide
        </p>
        <div className={`grid grid-cols-2 gap-8 text-center max-w-4xl mx-auto ${items.length >= 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
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
