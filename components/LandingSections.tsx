'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Building2, User, Users, DollarSign, Globe, TrendingUp, Layers, Trophy,
  Shield, Sparkles, Eye, Scale, AlertTriangle, Activity, Rocket, Lightbulb,
  Flame, MessageCircle, Radio, FileDown, RefreshCw, BarChart3, LineChart,
  Wallet, Zap, Mail, CreditCard, Star, CheckCircle2, ArrowRight, ChevronDown,
} from 'lucide-react'
import { t } from '@/lib/i18n'
import type { EnDict } from '@/lib/i18n/dictionaries/en'
import { CREDIT_PACKAGES } from '@/lib/credits'
import { CtaButton } from './CtaButton'

// ── Types ──

export interface SocialProofStats {
  accountsEvaluated: number
  totalValueAssessed: number
  uniqueVisitors: number
}

interface BaseSectionProps {
  dict: EnDict
  interactive?: boolean
}

interface UseCasesSectionProps extends BaseSectionProps {
  onFocusInput?: () => void
  onScrollToPricing?: () => void
}

interface PricingSectionProps extends BaseSectionProps {
  checkoutLoading: boolean
  onCheckout: (packageId: string) => void
}

interface CapabilitiesSectionProps extends BaseSectionProps {
  onFocusInput?: () => void
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface FAQSectionProps extends BaseSectionProps {}

// ── Helpers ──

export function CapFeature({ icon, color, title, items }: {
  icon: React.ReactNode
  color: 'pink' | 'cyan'
  title: string
  items: readonly string[]
}) {
  const borderColor = color === 'pink' ? 'border-[#FF0050]/20 group-hover:border-[#00F2EA]/20' : 'border-[#00F2EA]/20 group-hover:border-[#00F2EA]/20'
  const iconBg = color === 'pink' ? 'bg-[#FF0050]/10' : 'bg-[#00F2EA]/10'
  const iconColor = color === 'pink' ? 'text-[#FF0050]' : 'text-[#00F2EA]'
  const dotColor = color === 'pink' ? 'bg-[#FF0050]/60' : 'bg-[#00F2EA]/60'
  return (
    <div className={`rounded-xl border ${borderColor} bg-neutral-900/40 p-4 transition-all`}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`flex items-center justify-center h-7 w-7 rounded-lg ${iconBg} ${iconColor}`}>
          {icon}
        </div>
        <h4 className="text-sm font-semibold text-white">{title}</h4>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] text-neutral-400 leading-relaxed">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function LandingFaqItem({ question, answer, interactive }: { question: string; answer: string; interactive: boolean }) {
  // Interactive mode uses useState for accordion; static uses <details>
  if (interactive) {
    return <ClientFaqItem question={question} answer={answer} />
  }
  return (
    <details className="group border-b border-neutral-800">
      <summary className="w-full flex items-center justify-between py-4 text-left text-sm font-medium text-white hover:text-[#00F2EA] transition-colors cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {question}
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-4 text-sm text-neutral-400 leading-relaxed">{answer}</div>
    </details>
  )
}

function ClientFaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-neutral-800">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left text-sm font-medium text-white hover:text-[#00F2EA] transition-colors"
      >
        {question}
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="pb-4 text-sm text-neutral-400 leading-relaxed">{answer}</div>
      )}
    </div>
  )
}

// ── Social Proof ──

export function SocialProofSection({ dict, stats }: { dict: EnDict; stats: SocialProofStats }) {
  const hasStats = stats.accountsEvaluated > 0

  return (
    <section className="border-b border-neutral-800 bg-[#0a0a0a] py-12">
      <div className="mx-auto max-w-5xl px-4">
        <div className="grid grid-cols-3 gap-8 text-center">
          {[
            {
              value: hasStats ? `${stats.accountsEvaluated.toLocaleString()}+` : '11+',
              label: dict.home.socialProof.accountsEvaluated,
            },
            {
              value: hasStats
                ? `$${stats.totalValueAssessed >= 1_000_000_000
                  ? (stats.totalValueAssessed / 1_000_000_000).toFixed(1) + 'B+'
                  : stats.totalValueAssessed >= 1_000_000
                  ? (stats.totalValueAssessed / 1_000_000).toFixed(1) + 'M+'
                  : stats.totalValueAssessed.toLocaleString() + '+'
                }`
                : '$59.1M+',
              label: dict.home.socialProof.totalValueAssessed,
            },
            {
              value: hasStats ? `${stats.uniqueVisitors.toLocaleString()}+` : '117+',
              label: dict.home.socialProof.uniqueVisitors,
            },
          ].map((stat, i) => (
            <div key={i}>
              <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">{stat.value}</div>
              <div className="mt-1 text-xs sm:text-sm text-neutral-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Use Cases ──

export function UseCasesSection({ dict, interactive = true, onFocusInput, onScrollToPricing }: UseCasesSectionProps) {
  return (
    <section className="border-b border-neutral-800 py-16">
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="text-2xl font-bold text-center mb-10">{dict.home.useCases.title}</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Building2, title: dict.home.useCases.brands.title,
              desc: dict.home.useCases.brands.desc,
              cta: dict.home.useCases.brands.cta,
              action: onFocusInput,
              image: '/images/role-brands.jpg',
            },
            {
              icon: User, title: dict.home.useCases.creators.title,
              desc: dict.home.useCases.creators.desc,
              cta: dict.home.useCases.creators.cta,
              action: onFocusInput,
              image: '/images/role-creators.jpg',
            },
            {
              icon: Users, title: dict.home.useCases.agencies.title,
              desc: dict.home.useCases.agencies.desc,
              cta: dict.home.useCases.agencies.cta,
              action: onScrollToPricing,
              image: '/images/role-agencies.jpg',
            },
          ].map((item, i) => {
            const Icon = item.icon
            return (
              <div key={i} className="group rounded-2xl border border-neutral-800 bg-[#141414] overflow-hidden hover:border-[#00F2EA]/20 transition-all hover:-translate-y-1">
                <div className="relative h-40 overflow-hidden">
                  <Image
                    src={item.image}
                    alt={item.title}
                    width={400}
                    height={200}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/20 to-transparent" />
                </div>
                <div className="p-6 pt-0 -mt-8 relative z-10">
                  <div className="w-11 h-11 rounded-xl bg-[#00F2EA]/10 flex items-center justify-center mb-4">
                    <Icon className="h-5 w-5 text-[#00F2EA]" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-neutral-400 leading-relaxed mb-4">{item.desc}</p>
                  {interactive ? (
                    <button onClick={item.action} className="text-sm font-medium text-[#FF0050] hover:text-[#ff2d6a] transition-colors">
                      {item.cta} →
                    </button>
                  ) : (
                    <span className="text-sm font-medium text-[#FF0050]">
                      {item.cta} →
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── Pricing ──

export function PricingSection({ dict, interactive = true, checkoutLoading, onCheckout }: PricingSectionProps) {
  return (
    <section id="pricing" className="border-b border-neutral-800 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-4 py-1.5 text-xs font-medium text-[#00F2EA] mb-4">
            <Zap className="h-3.5 w-3.5" />
            Pricing
          </div>
          <h2 className="text-3xl font-bold sm:text-4xl">{dict.home.pricing.title}</h2>
          <p className="mt-4 max-w-xl mx-auto text-neutral-400">{dict.home.pricing.subtitle}</p>
        </div>

        {/* Trust Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-12 max-w-3xl mx-auto">
          {dict.home.pricing.trustBar.map((item: { icon: string; title: string; desc: string }) => {
            const Icon = item.icon === 'zap' ? Zap : item.icon === 'mail' ? Mail : CreditCard
            return (
              <div key={item.title} className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-[#0a0a0a] px-4 py-3">
                <Icon className="h-5 w-5 text-[#00F2EA] shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-white">{item.title}</div>
                  <div className="text-xs text-neutral-500">{item.desc}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {CREDIT_PACKAGES.map(pkg => {
            const plan = (dict.home.pricing.plans as unknown as Array<{
              id: string
              name: string
              desc: string
              highlight: boolean
              badge?: string
            }>).find(p => p.id === pkg.id)

            return (
              <div
                key={pkg.id}
                className={`relative rounded-2xl border-2 p-6 transition-all ${
                  pkg.highlight
                    ? 'border-[#FF0050] bg-gradient-to-b from-[#FF0050]/[0.06] to-transparent shadow-lg shadow-[#FF0050]/5'
                    : 'border-neutral-800 bg-[#0a0a0a] hover:border-neutral-700'
                }`}
              >
                {pkg.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FF0050] px-3 py-1 text-[11px] font-bold text-white shadow-lg shadow-[#FF0050]/25">
                      <Star className="h-3 w-3" fill="currentColor" />
                      {dict.creditPackages[pkg.id as keyof typeof dict.creditPackages]?.badge ?? pkg.badge}
                    </span>
                  </div>
                )}

                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1">
                  {dict.creditPackages[pkg.id as keyof typeof dict.creditPackages]?.label ?? pkg.label}
                </p>
                <p className="text-sm text-neutral-400 mb-4">{plan?.desc}</p>

                <div className="flex items-baseline gap-0.5 mb-1">
                  <span className="text-neutral-500 text-lg">$</span>
                  <span className="text-5xl font-black text-white tracking-tight">{pkg.price}</span>
                </div>
                <p className="text-sm text-neutral-500">
                  <span className="text-white font-semibold">{pkg.credits}</span> evaluations
                </p>
                <p className="text-xs text-neutral-600 mt-0.5">{pkg.perUnit}</p>

                {interactive ? (
                  <CtaButton
                    variant={pkg.highlight ? 'primary' : 'outline'}
                    className="mt-5 w-full"
                    disabled={checkoutLoading}
                    icon={checkoutLoading ? undefined : undefined}
                    onClick={() => onCheckout(pkg.id)}
                  >
                    {checkoutLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Redirecting...
                      </span>
                    ) : (
                      dict.common.getStarted
                    )}
                  </CtaButton>
                ) : (
                  <Link
                    href="/"
                    className={`mt-5 w-full block text-center rounded-xl py-2.5 text-sm font-semibold transition-all ${
                      pkg.highlight
                        ? 'bg-[#FF0050] text-white hover:bg-[#e60049] shadow-lg shadow-[#FF0050]/20'
                        : 'border border-neutral-700 text-neutral-300 hover:border-[#FF0050] hover:text-[#FF0050]'
                    }`}
                  >
                    {dict.common.getStarted}
                  </Link>
                )}
              </div>
            )
          })}
        </div>

        {/* All plans include */}
        <div className="mb-12">
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold text-white mb-2">{dict.home.pricing.allPlansInclude.title}</h3>
            <p className="text-sm text-neutral-500 max-w-xl mx-auto">{dict.home.pricing.allPlansInclude.subtitle}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 max-w-3xl mx-auto">
            {dict.home.pricing.allPlansInclude.list.map((f: string) => (
              <div key={f} className="flex items-center gap-2.5 text-sm">
                <CheckCircle2 className="h-4 w-4 text-[#00F2EA] shrink-0" />
                <span className="text-neutral-300">{dict.home.pricing.allPlansInclude.features[f as keyof typeof dict.home.pricing.allPlansInclude.features]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-6 text-xs text-neutral-600">
          {dict.home.pricing.footer.map((text: string, i: number) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-[#00F2EA]/50" />
              {text}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Core Capabilities ──

export function CoreCapabilitiesSection({ dict, interactive = true, onFocusInput }: CapabilitiesSectionProps) {
  return (
    <section id="capabilities" className="border-b border-neutral-800 py-20">
      <div className="mx-auto max-w-5xl px-4">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-4 py-1.5 text-xs font-medium text-[#00F2EA] mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            {dict.home.capabilities.badge}
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">
            {dict.home.capabilities.title}
          </h2>
          <p className="text-neutral-500 text-sm max-w-2xl mx-auto leading-relaxed">
            {dict.home.capabilities.description}
          </p>
        </div>

        {/* 1. BUSINESS VALUATION */}
        <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] via-[#0f0f0f] to-[#FF0050]/[0.04] p-6 sm:p-8 mb-5 hover:border-[#00F2EA]/20 transition-all group">
          <div className="flex flex-col lg:flex-row lg:items-start gap-6 lg:gap-10">
            <div className="lg:w-[340px] shrink-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF0050]/10 border border-[#FF0050]/20 px-3 py-1 text-[10px] font-semibold text-[#FF0050] uppercase tracking-wider mb-4">
                <DollarSign className="h-3 w-3" /> {dict.home.capabilities.valuation.badge}
              </span>
              <h3 className="text-xl font-bold mb-2">{dict.home.capabilities.valuation.title}</h3>
              <p className="text-sm text-neutral-400 leading-relaxed mb-5">
                {dict.home.capabilities.valuation.desc}
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[#FF0050]/5 border border-[#FF0050]/10">
                  <DollarSign className="h-5 w-5 text-[#FF0050] shrink-0" />
                  <div>
                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider">{dict.home.capabilities.valuation.rangeLabel}</div>
                    <div className="text-base font-bold text-[#FF0050]">{dict.home.capabilities.valuation.rangeValue}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[#FF0050]/5 border border-[#FF0050]/10">
                  <Globe className="h-5 w-5 text-[#FF0050] shrink-0" />
                  <div>
                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider">{dict.home.capabilities.valuation.coverageLabel}</div>
                    <div className="text-sm font-semibold text-white">{dict.home.capabilities.valuation.coverageValue}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 grid gap-3 sm:grid-cols-2">
              <CapFeature icon={<DollarSign className="h-4 w-4" />} color="pink" title={dict.home.capabilities.valuation.features.incomeBreakdown.title} items={dict.home.capabilities.valuation.features.incomeBreakdown.items} />
              <CapFeature icon={<TrendingUp className="h-4 w-4" />} color="pink" title={dict.home.capabilities.valuation.features.revenueRoadmap.title} items={dict.home.capabilities.valuation.features.revenueRoadmap.items} />
              <CapFeature icon={<Layers className="h-4 w-4" />} color="pink" title={dict.home.capabilities.valuation.features.valueBreakdown.title} items={dict.home.capabilities.valuation.features.valueBreakdown.items} />
              <CapFeature icon={<Trophy className="h-4 w-4" />} color="pink" title={dict.home.capabilities.valuation.features.peerBenchmarking.title} items={dict.home.capabilities.valuation.features.peerBenchmarking.items} />
            </div>
          </div>
        </div>

        {/* 2. AUTHORITY & RISK */}
        <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] via-[#0f0f0f] to-[#00F2EA]/[0.04] p-6 sm:p-8 mb-5 hover:border-[#00F2EA]/20 transition-all group">
          <div className="flex flex-col lg:flex-row lg:items-start gap-6 lg:gap-10">
            <div className="lg:w-[340px] shrink-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#00F2EA]/10 border border-[#00F2EA]/20 px-3 py-1 text-[10px] font-semibold text-[#00F2EA] uppercase tracking-wider mb-4">
                <Shield className="h-3 w-3" /> {dict.home.capabilities.authority.badge}
              </span>
              <h3 className="text-xl font-bold mb-2">{dict.home.capabilities.authority.title}</h3>
              <p className="text-sm text-neutral-400 leading-relaxed mb-5">
                {dict.home.capabilities.authority.desc}
              </p>
              <div className="mb-4 space-y-2">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">{dict.home.capabilities.authority.valueLevels.title}</div>
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-amber-500/5 border border-amber-500/15">
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center mt-0.5">
                    <Trophy className="h-4 w-4 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-amber-300">{dict.home.capabilities.authority.valueLevels.premium.label}</div>
                    <div className="text-[11px] text-neutral-400 leading-relaxed">{dict.home.capabilities.authority.valueLevels.premium.desc}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gradient-to-r from-[#00F2EA]/10 to-[#00F2EA]/5 border border-[#00F2EA]/15">
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-[#00F2EA]/20 flex items-center justify-center mt-0.5">
                    <TrendingUp className="h-4 w-4 text-[#00F2EA]" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#00F2EA]">{dict.home.capabilities.authority.valueLevels.growth.label}</div>
                    <div className="text-[11px] text-neutral-400 leading-relaxed">{dict.home.capabilities.authority.valueLevels.growth.desc}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gradient-to-r from-purple-500/10 to-purple-500/5 border border-purple-500/15">
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center mt-0.5">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-purple-300">{dict.home.capabilities.authority.valueLevels.developing.label}</div>
                    <div className="text-[11px] text-neutral-400 leading-relaxed">{dict.home.capabilities.authority.valueLevels.developing.desc}</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-[#00F2EA]/5 border border-[#00F2EA]/10">
                <Eye className="h-5 w-5 text-[#00F2EA] shrink-0" />
                <div className="text-xs text-neutral-400">
                  {t(dict.home.capabilities.authority.brandCheck, { pct: '85' })}
                </div>
              </div>
            </div>
            <div className="flex-1 grid gap-3 sm:grid-cols-2">
              <CapFeature icon={<Scale className="h-4 w-4" />} color="cyan" title={dict.home.capabilities.authority.features.radarScoring.title} items={dict.home.capabilities.authority.features.radarScoring.items} />
              <CapFeature icon={<AlertTriangle className="h-4 w-4" />} color="cyan" title={dict.home.capabilities.authority.features.riskIntelligence.title} items={dict.home.capabilities.authority.features.riskIntelligence.items} />
              <CapFeature icon={<Building2 className="h-4 w-4" />} color="cyan" title={dict.home.capabilities.authority.features.brandSuitability.title} items={dict.home.capabilities.authority.features.brandSuitability.items} />
              <CapFeature icon={<Activity className="h-4 w-4" />} color="cyan" title={dict.home.capabilities.authority.features.accountHealth.title} items={dict.home.capabilities.authority.features.accountHealth.items} />
            </div>
          </div>
        </div>

        {/* 3. GROWTH & MONETIZATION */}
        <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] via-[#0f0f0f] to-[#FF0050]/[0.04] p-6 sm:p-8 mb-5 hover:border-[#00F2EA]/20 transition-all group">
          <div className="flex flex-col lg:flex-row lg:items-start gap-6 lg:gap-10">
            <div className="lg:w-[340px] shrink-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF0050]/10 border border-[#FF0050]/20 px-3 py-1 text-[10px] font-semibold text-[#FF0050] uppercase tracking-wider mb-4">
                <Rocket className="h-3 w-3" /> {dict.home.capabilities.growth.badge}
              </span>
              <h3 className="text-xl font-bold mb-2">{dict.home.capabilities.growth.title}</h3>
              <p className="text-sm text-neutral-400 leading-relaxed mb-5">
                {dict.home.capabilities.growth.desc}
              </p>
              <div className="space-y-2 text-xs">
                {dict.home.capabilities.growth.guarantees.map((text, i) => (
                  <div key={i} className="flex items-center gap-2 text-neutral-400">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#00F2EA] shrink-0" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 grid gap-3 sm:grid-cols-2">
              <CapFeature icon={<Lightbulb className="h-4 w-4" />} color="pink" title={dict.home.capabilities.growth.features.contentStrategy.title} items={dict.home.capabilities.growth.features.contentStrategy.items} />
              <CapFeature icon={<Rocket className="h-4 w-4" />} color="pink" title={dict.home.capabilities.growth.features.monetizationBlueprint.title} items={dict.home.capabilities.growth.features.monetizationBlueprint.items} />
              <CapFeature icon={<Flame className="h-4 w-4" />} color="pink" title={dict.home.capabilities.growth.features.trendForecasting.title} items={dict.home.capabilities.growth.features.trendForecasting.items} />
              <CapFeature icon={<MessageCircle className="h-4 w-4" />} color="pink" title={dict.home.capabilities.growth.features.engagementDeepDive.title} items={dict.home.capabilities.growth.features.engagementDeepDive.items} />
            </div>
          </div>
        </div>

        {/* Additional Capabilities Summary */}
        <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] to-[#141414] p-6 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Radio className="h-4 w-4 text-[#FF0050]" />
            <h4 className="text-sm font-semibold text-neutral-300">{dict.home.capabilities.alsoIncluded.title}</h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {dict.home.capabilities.alsoIncluded.items.map((item, i) => {
              const icons = [FileDown, RefreshCw, Globe, BarChart3, LineChart, Wallet]
              const Icon = icons[i] || Radio
              return (
                <div key={i} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-neutral-900/50 border border-neutral-800 hover:border-[#00F2EA]/20 transition-colors text-center">
                  <Icon className="h-4 w-4 text-[#00F2EA]" />
                  <span className="text-[11px] font-medium text-neutral-300">{item.label}</span>
                  <span className="text-[10px] text-neutral-500">{item.desc}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* CTA Banner */}
        <div className="text-center mt-8">
          <p className="text-sm text-neutral-500 mb-4">{dict.home.capabilities.ctaHint}</p>
          {interactive ? (
            <CtaButton
              variant="gradient"
              size="lg"
              icon={<ArrowRight className="h-4 w-4" />}
              onClick={onFocusInput}
            >
              {dict.home.capabilities.cta}
            </CtaButton>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF0050] to-[#e60049] px-6 py-3 text-sm font-semibold text-white hover:from-[#e60049] hover:to-[#cc0040] transition-all shadow-lg shadow-[#FF0050]/25"
            >
              {dict.home.capabilities.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}

// ── FAQ ──

export function FAQSection({ dict, interactive = true }: FAQSectionProps) {
  return (
    <section className="border-b border-neutral-800 py-16">
      <div className="mx-auto max-w-2xl px-4">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-4 py-1.5 text-xs font-medium text-[#00F2EA] mb-4">
            <MessageCircle className="h-3.5 w-3.5" />
            {dict.home.faq.badge}
          </div>
          <h2 className="text-2xl font-bold">{dict.home.faq.title}</h2>
        </div>

        {Object.entries(dict.home.faq.questions).map(([key, item]) => (
          <LandingFaqItem key={key} question={item.q} answer={item.a} interactive={interactive} />
        ))}
      </div>
    </section>
  )
}
