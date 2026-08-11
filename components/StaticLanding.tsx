import { Zap, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import { getServerDict } from '@/lib/i18n/server'
import type { EnDict } from '@/lib/i18n/dictionaries/en'
import { HomepageJsonLd } from '@/components/HomepageJsonLd'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import {
  PricingSection,
  FAQSection,
} from './LandingSections'

/**
 * StaticLanding — SSR 输出的静态首页内容。
 *
 * 原理：首页的 HomePageContent 因使用 useSearchParams 在静态预渲染时
 * bailout 到客户端渲染，Next.js 会把最近的 <Suspense> fallback 渲染进
 * SSR HTML。本组件作为 fallback，让搜索引擎爬虫拿到完整首页内容
 * （H1、Use Cases、Capabilities、Pricing、FAQ）。
 *
 * 纯展示组件：只读 i18n 字典，无任何 state / 事件绑定。
 * FAQ 用 <details> 实现展开，无需 JS 也能查看。
 */

export function StaticLanding() {
  const d: EnDict = getServerDict()

  // No-op callbacks for non-interactive sections
  const noop = () => {}

  return (
    <div className="min-h-screen flex flex-col">
      <link rel="canonical" href="https://tokvalue.com/" />
      <HomepageJsonLd />
      <SiteHeader />

      {/* Hero — 静态文字 */}
      <section className="relative overflow-hidden border-b border-neutral-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#FF0050]/10 via-transparent to-transparent" />
        <div className="mx-auto max-w-3xl px-4 py-20 sm:py-24 relative">
          <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4">
              {d.home.hero.title}
            </h1>
            <p className="text-lg text-neutral-400 max-w-xl mx-auto">
              {d.home.hero.subtitle}
            </p>
          </div>
          <div className="flex items-center rounded-2xl border border-neutral-700 bg-neutral-900/80 backdrop-blur px-4 py-3">
            <span className="text-neutral-500 text-lg mr-3">@</span>
            <input
              type="text"
              placeholder={d.home.hero.placeholder}
              aria-label={d.home.hero.ariaLabel}
              disabled
              className="flex-1 bg-transparent text-lg outline-none placeholder:text-neutral-600"
            />
            <span className="ml-3 inline-flex items-center gap-2 rounded-xl bg-[#FF0050] px-5 py-2.5 font-semibold text-white opacity-60">
              <Zap className="h-4 w-4" />
              {d.common.evaluate}
            </span>
          </div>
        </div>
      </section>

      {/* How It Works — Static summary */}
      <section className="border-b border-neutral-800 py-16">
        <div className="mx-auto max-w-2xl px-4 text-center">
          <h2 className="text-2xl font-bold mb-4">From username to valuation in 10 seconds</h2>
          <p className="text-neutral-400 leading-relaxed">
            Type any public TikTok @username — your own, a competitor&apos;s, or an influencer you&apos;re considering hiring.
            We scan 10 dimensions in real-time: engagement quality, follower authenticity, content consistency, and more.
            Instantly see your tier rating, value range, and risk summary. No credit card required.
          </p>
        </div>
      </section>

      {/* Free vs Pro — Static summary */}
      <section className="border-b border-neutral-800 py-16">
        <div className="mx-auto max-w-2xl px-4 text-center">
          <h2 className="text-2xl font-bold mb-4">Free report, or go deeper</h2>
          <p className="text-neutral-400 leading-relaxed mb-4">
            The free report gives you tier rating, account value range, risk &amp; authenticity scan, and peer percentile ranking.
          </p>
          <p className="text-neutral-400 leading-relaxed">
            Upgrade to Pro ($9 one-time) to unlock 5-channel revenue breakdown, brand deal pricing engine, 12-month growth forecast, AI content strategy, brand matching, and PDF/PNG export.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <PricingSection dict={d} interactive={false} checkoutLoading={false} onCheckout={noop} />

      {/* Blog CTA */}
      <section className="border-b border-neutral-800 py-16">
        <div className="mx-auto max-w-2xl px-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FF0050]/20 bg-[#FF0050]/5 px-4 py-1.5 text-xs font-medium text-[#FF0050] mb-4">
            <MessageCircle className="h-3.5 w-3.5" />
            Free Resources
          </div>
          <h2 className="text-2xl font-bold mb-3">Creator Economy Data & Guides</h2>
          <p className="text-neutral-400 max-w-xl mx-auto mb-6">
            In-depth articles on TikTok valuation, brand deal pricing, engagement benchmarks, and monetization strategies — methodology references industry data and our valuation engine.
          </p>
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 rounded-full bg-[#00F2EA] px-8 py-3 text-sm font-semibold text-black transition hover:bg-[#00D4CE]"
          >
            Read the Blog →
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <FAQSection dict={d} interactive={false} />

      {/* Footer */}
      <SiteFooter />
    </div>
  )
}
