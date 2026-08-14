'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  DollarSign,
  Shield, Sparkles,
  Zap, Star, ArrowRight, ChevronDown, MessageCircle,
  Search, Check,
} from 'lucide-react'
import type { EnDict } from '@/lib/i18n/dictionaries/en'
import { CREDIT_PACKAGES } from '@/lib/credits'
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
  const paidPkgs = CREDIT_PACKAGES.filter(p => p.id !== 'pack30')

  return (
    <section id="pricing" className="py-20">
      <div className="mx-auto max-w-5xl px-4">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-4 py-1.5 text-xs font-medium text-[#00F2EA] mb-4">
            <Zap className="h-3.5 w-3.5" />
            Pricing
          </div>
          <h2 className="text-3xl font-bold sm:text-4xl mb-4">{dict.home.pricing.title}</h2>
          <p className="max-w-xl mx-auto text-neutral-400 text-lg">{dict.home.pricing.subtitle}</p>
        </div>

        {/* 3 cards: Free · $9 · $29 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-10">
          {/* Free */}
          <div className="rounded-2xl border border-[#00F2EA]/20 bg-[#00F2EA]/[0.04] p-6 flex flex-col">
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
          {paidPkgs.map((pkg, i) => {
            const plan = dict.home.pricing.plans[i] as { name: string; desc: string; badge?: string; highlight: boolean }
            return (
              <div
                key={pkg.id}
                className={`relative rounded-2xl border-2 p-6 transition-all flex flex-col ${
                  plan.highlight
                    ? 'border-[#FF0050]/30 bg-gradient-to-b from-[#FF0050]/[0.06] to-[#0E0E14] shadow-lg shadow-[#FF0050]/5'
                    : 'border-[#1F1D26] bg-[#0E0E14] hover:border-neutral-600'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FF0050] px-3 py-1 text-[11px] font-bold text-white shadow-lg shadow-[#FF0050]/25">
                      <Star className="h-3 w-3" fill="currentColor" />
                      {plan.badge}
                    </span>
                  </div>
                )}
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1 mt-1">{plan.name}</p>
                <p className="text-xs text-neutral-500 mb-4 leading-relaxed">{plan.desc}</p>
                <div className="flex items-baseline gap-0.5 mb-1">
                  <span className="text-neutral-500 text-lg">$</span>
                  <span className="text-5xl font-black text-white tracking-tight">{pkg.price}</span>
                </div>
                <p className="text-sm text-neutral-500 mb-5">
                  <span className="text-white font-semibold">{pkg.credits}</span> evaluation{pkg.credits > 1 ? 's' : ''}
                  <span className="mx-1.5 text-neutral-700">·</span>
                  {pkg.perUnit}
                </p>
                {interactive ? (
                  <CtaButton
                    variant={plan.highlight ? 'primary' : 'outline'}
                    className="mt-auto w-full"
                    disabled={checkoutLoading}
                    onClick={() => onCheckout(pkg.id)}
                  >
                    {checkoutLoading ? (
                      <span className="flex items-center justify-center gap-2"><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Redirecting...</span>
                    ) : (
                      `Get $${pkg.price}`
                    )}
                  </CtaButton>
                ) : (
                  <Link
                    href="/"
                    className={`mt-auto w-full block text-center rounded-xl py-2.5 text-sm font-semibold transition-all ${
                      plan.highlight ? 'bg-[#FF0050] text-white hover:bg-[#e60049] shadow-lg shadow-[#FF0050]/20' : 'border border-neutral-700 text-neutral-300 hover:border-[#FF0050] hover:text-[#FF0050]'
                    }`}
                  >
                    Get ${pkg.price}
                  </Link>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap justify-center gap-6 text-xs text-neutral-600">
          {dict.home.pricing.footer.map((text: string, i: number) => (
            <div key={i} className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-[#00F2EA]/50" />{text}</div>
          ))}
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
