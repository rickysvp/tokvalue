'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  DollarSign,
  Shield, Sparkles,
  Zap, Star, ArrowRight, ChevronDown, MessageCircle,
  Search, Check, CheckCircle2,
} from 'lucide-react'
import type { EnDict } from '@/lib/i18n/dictionaries/en'
import { CREDIT_PACKAGES, savePct } from '@/lib/credits'
import { t } from '@/lib/i18n'
import { trackEvent } from '@/lib/track-client'
import { CtaButton } from './CtaButton'

// ── Types ──

interface BaseSectionProps {
  dict: EnDict
  interactive?: boolean
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

function LandingFaqItem({ question, answer, interactive, defaultOpen = false }: {
  question: string; answer: string; interactive: boolean; defaultOpen?: boolean
}) {
  if (interactive) {
    return <ClientFaqItem question={question} answer={answer} defaultOpen={defaultOpen} />
  }
  return (
    <details className="group border-b border-[#1F1D26]" open={defaultOpen}>
      <summary className="w-full flex items-center justify-between py-4 text-left text-sm font-medium text-white hover:text-[#00F2EA] transition-colors cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {question}
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-4 text-sm text-neutral-400 leading-relaxed">{answer}</div>
    </details>
  )
}

function ClientFaqItem({ question, answer, defaultOpen = false }: {
  question: string; answer: string; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-[#1F1D26]">
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

// ── Pricing ──

export function PricingSection({ dict, interactive = true, checkoutLoading, onCheckout }: PricingSectionProps) {
  const free = dict.home.pricing.freePlan as { name: string; desc: string; cta: string }
  // 全部三个付费套餐（含 pack30 高价锚点），让 $29 更显划算
  const paidPkgs = CREDIT_PACKAGES
  const plansById = new Map(
    (dict.home.pricing.plans as ReadonlyArray<{ id: string; name: string; desc: string; badge?: string; highlight?: boolean }>)
      .map(p => [p.id, p] as const)
  )

  // B7 Spec §15：pricing 区可见曝光（IntersectionObserver，每次挂载最多一次）
  const sectionRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      // 环境不支持（老浏览器/SSR）→ 直接按挂载计
      trackEvent('pricing_viewed')
      return
    }
    let fired = false
    const observer = new IntersectionObserver(
      entries => {
        if (fired) return
        if (entries.some(e => e.isIntersecting)) {
          fired = true
          trackEvent('pricing_viewed')
          observer.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section id="pricing" ref={sectionRef} className="py-20 relative">
      {/* 背景光斑：定价区强化氛围 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[640px] h-[320px] bg-[#FF0050]/[0.07] rounded-full blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-4 relative">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-4 py-1.5 text-xs font-medium text-[#00F2EA] mb-4">
            <Zap className="h-3.5 w-3.5" />
            Pricing
          </div>
          <h2 className="text-3xl font-bold sm:text-4xl mb-4">{dict.home.pricing.title}</h2>
          <p className="max-w-xl mx-auto text-neutral-400 text-lg">{dict.home.pricing.subtitle}</p>
        </div>

        {/* Free + 3 paid plans：推荐套餐（Growth）视觉放大 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch mb-8">
          {/* Free */}
          <div className="rounded-2xl border border-[#00F2EA]/20 bg-[#00F2EA]/[0.03] p-6 flex flex-col">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#00F2EA] mb-3">{free.name}</p>
            <p className="text-sm text-neutral-400 mb-4 leading-relaxed">{free.desc}</p>
            <div className="flex items-baseline gap-0.5 mb-4">
              <span className="text-5xl font-black text-white tracking-tight">$0</span>
            </div>
            <p className="text-xs text-neutral-500 mb-5">No credit card required</p>
            {interactive ? (
              <a href="#hero" className="mt-auto w-full block text-center rounded-xl py-2.5 text-sm font-semibold border border-[#00F2EA]/30 text-[#00F2EA] hover:bg-[#00F2EA]/10 transition-all">
                {free.cta}
              </a>
            ) : (
              <Link href="/" className="mt-auto w-full block text-center rounded-xl py-2.5 text-sm font-semibold border border-[#00F2EA]/30 text-[#00F2EA]">{free.cta}</Link>
            )}
          </div>

          {/* Paid plans */}
          {paidPkgs.map((pkg) => {
            const plan = plansById.get(pkg.id)
            const saving = savePct(pkg)
            const isHighlight = !!plan?.highlight
            return (
              <div
                key={pkg.id}
                className={`relative rounded-2xl p-6 transition-all flex flex-col ${
                  isHighlight
                    ? 'border-2 border-[#FF0050] bg-gradient-to-b from-[#FF0050]/[0.10] via-[#160a10] to-[#0E0E14] shadow-[0_0_40px_-8px_rgba(255,0,80,0.45)] lg:scale-[1.06] lg:-my-2 lg:z-10'
                    : 'border border-[#1F1D26] bg-[#0E0E14] hover:border-neutral-600'
                }`}
              >
                {/* 推荐徽章 */}
                {plan?.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FF0050] px-3.5 py-1 text-[11px] font-bold text-white shadow-lg shadow-[#FF0050]/40 whitespace-nowrap">
                      <Star className="h-3 w-3" fill="currentColor" />
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* 节省徽章（右上角，实心高对比） */}
                {saving !== null && saving > 0 && (
                  <div className={`absolute -top-3 right-3 z-10 ${isHighlight ? 'top-3 right-3' : '-top-3 right-3'}`}>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-black ${isHighlight ? 'bg-[#00F2EA] text-black' : 'bg-[#00F2EA]/15 text-[#00F2EA] border border-[#00F2EA]/30'}`}>
                      {t(dict.home.pricing.saveBadge, { pct: saving })}
                    </span>
                  </div>
                )}

                <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${isHighlight ? 'text-[#FF0050] mt-1' : 'text-neutral-500 mt-1'}`}>{plan?.name ?? pkg.label}</p>
                <p className="text-xs text-neutral-500 mb-4 leading-relaxed">{plan?.desc ?? ''}</p>

                {/* 价格 */}
                <div className="flex items-baseline gap-1 mb-1">
                  <span className={`text-xl font-bold ${isHighlight ? 'text-white' : 'text-neutral-500'}`}>$</span>
                  <span className={`text-5xl font-black tracking-tight ${isHighlight ? 'text-white' : 'text-white'}`}>{pkg.price}</span>
                  <span className="text-sm text-neutral-500 ml-1">one-time</span>
                </div>

                {/* 单价：核心说服点，独立一行醒目展示 */}
                <div className="mb-4">
                  <p className="text-sm text-white font-bold">{pkg.credits} evaluation{pkg.credits > 1 ? 's' : ''}</p>
                  <p className={`text-sm mt-0.5 ${isHighlight ? 'text-[#00F2EA] font-semibold' : 'text-neutral-500'}`}>{pkg.perUnit}</p>
                </div>

                {interactive ? (
                  <CtaButton
                    variant={isHighlight ? 'primary' : 'outline'}
                    className={`mt-auto w-full ${isHighlight ? 'py-3.5' : ''}`}
                    disabled={checkoutLoading}
                    onClick={() => onCheckout(pkg.id)}
                  >
                    {checkoutLoading ? (
                      <span className="flex items-center justify-center gap-2"><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Redirecting...</span>
                    ) : (
                      dict.home.pricing.getCta
                    )}
                  </CtaButton>
                ) : (
                  <Link
                    href="/"
                    className={`mt-auto w-full block text-center rounded-xl py-2.5 text-sm font-semibold transition-all ${
                      isHighlight ? 'bg-[#FF0050] text-white hover:bg-[#e60049] shadow-lg shadow-[#FF0050]/20' : 'border border-neutral-700 text-neutral-300 hover:border-[#FF0050] hover:text-[#FF0050]'
                    }`}
                  >
                    {t(dict.home.pricing.getCta)}
                  </Link>
                )}
              </div>
            )
          })}
        </div>

        {/* 担保背书：提升转化信任 */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-x-6 gap-y-2 text-sm text-neutral-500">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#00F2EA]" />
            <span>{dict.home.pricing.oneTime}</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[#00F2EA]" />
            <span>{dict.home.pricing.moneyBack}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Core Capabilities ──

export function CoreCapabilitiesSection({ dict, interactive = true, onFocusInput }: CapabilitiesSectionProps) {
  const storyIcons = [DollarSign, Shield, Search]
  const storyAccents = [
    { icon: 'text-[#FF0050]', bg: 'bg-[#FF0050]/10', border: 'border-[#FF0050]/20' },
    { icon: 'text-[#00F2EA]', bg: 'bg-[#00F2EA]/10', border: 'border-[#00F2EA]/20' },
    { icon: 'text-[#E8A840]', bg: 'bg-[#E8A840]/10', border: 'border-[#E8A840]/20' },
  ]
  return (
    <section id="capabilities" className="py-20">
      <div className="mx-auto max-w-5xl px-4">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-4 py-1.5 text-xs font-medium text-[#00F2EA] mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            {dict.home.capabilities.badge}
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">
            {dict.home.capabilities.title}
          </h2>
          <p className="text-neutral-500 text-sm max-w-xl mx-auto leading-relaxed">
            {dict.home.capabilities.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {dict.home.capabilities.story.map((card, i) => {
            const Icon = storyIcons[i] || DollarSign
            const accent = storyAccents[i] || storyAccents[0]
            return (
              <div
                key={i}
                className={`rounded-2xl border ${accent.border} bg-gradient-to-b from-[#0f0f0f] to-[#0a0a0a] p-7 flex flex-col hover:-translate-y-1 transition-transform duration-300`}
              >
                <div className={`flex items-center justify-center h-11 w-11 rounded-xl ${accent.bg} ${accent.icon} mb-5`}>
                  <Icon className="h-5 w-5" />
                </div>

                <h3 className="text-lg font-semibold text-white mb-2">{card.title}</h3>
                <p className="text-sm text-neutral-400 leading-relaxed mb-5 flex-1">
                  {card.desc}
                </p>

                <div className="flex flex-wrap gap-2">
                  {card.tags.map((tag, j) => (
                    <span
                      key={j}
                      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900/60 px-2.5 py-1 text-[11px] font-medium text-neutral-300"
                    >
                      <Check className="h-3 w-3 text-[#00F2EA]" />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="text-center mt-12">
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

export function FAQSection({ dict, interactive = true }: FAQSectionProps) {
  // Get questions array from dict
  const questions = Object.entries(dict.home.faq.questions)
  const firstTwoKeys = questions.slice(0, 2).map(([k]) => k)

  return (
    <section className="py-20">
      <div className="mx-auto max-w-2xl px-4">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-4 py-1.5 text-xs font-medium text-[#00F2EA] mb-4">
            <MessageCircle className="h-3.5 w-3.5" />
            {dict.home.faq.badge}
          </div>
          <h2 className="text-2xl font-bold">{dict.home.faq.title}</h2>
        </div>

        {questions.map(([key, item]) => (
          <LandingFaqItem
            key={key}
            question={item.q}
            answer={item.a}
            interactive={interactive}
            defaultOpen={firstTwoKeys.includes(key)}
          />
        ))}
      </div>
    </section>
  )
}
