'use client'

import { useMemo } from 'react'
import { Evaluation } from '@/types'
import type { EnDict } from '@/lib/i18n/dictionaries/en'
import { VerdictHero } from './sections/VerdictHero'
import { AccountValue } from './sections/AccountValue'
import { DimensionRadar } from './sections/DimensionRadar'
import { PillarCards } from './sections/PillarCards'
import { IncomeOpportunities } from './sections/IncomeOpportunities'
import { DealPricing } from './sections/DealPricing'
import { RevenueRoadmapSection } from './sections/RevenueRoadmapSection'
import { PeerRanking } from './sections/PeerRanking'
import { GrowthContent } from './sections/GrowthContent'
import { BrandCommerce } from './sections/BrandCommerce'
import { RiskHealth } from './sections/RiskHealth'
import { ThirtyDayPlan } from './sections/ThirtyDayPlan'
import { ShareCardSection } from './sections/ShareCardSection'
import { Methodology } from './sections/Methodology'
import { TeaserMask } from './TeaserMask'
import { UnlockBar } from './UnlockBar'
import { ReportNav } from './ReportNav'

export function ReportShell({ result, dict, isPremium, onUnlock }: {
  result: Evaluation
  dict: EnDict
  isPremium: boolean
  onUnlock: () => void
}) {
  const u = dict.reportV2.unlock
  const n = dict.reportV2.nav

  // share-card / methodology 不进导航；id 与各 section 的 SectionHeader id 对齐
  const navItems = useMemo(() => [
    { id: 'verdict-hero', label: n.verdict },
    { id: 'account-value', label: n.value },
    { id: 'dimension-radar', label: n.radar },
    { id: 'pillars', label: n.pillars },
    { id: 'income', label: n.income },
    { id: 'deal-pricing', label: n.deal },
    { id: 'revenue-roadmap', label: n.roadmap },
    { id: 'peer-ranking', label: n.peer },
    { id: 'growth-content', label: n.growth },
    { id: 'brand-commerce', label: n.brand },
    { id: 'risk-health', label: n.risk },
    { id: 'thirty-day-plan', label: n.plan },
  ], [n])

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <ReportNav items={navItems} />

      {/* 1. VerdictHero —— 首屏判定，不遮罩 */}
      <VerdictHero result={result} dict={dict} isPremium={isPremium} />

      <div id="unlocked-content" className="scroll-mt-24 space-y-10">
        {/* 2. AccountValue */}
        <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
          <AccountValue result={result} dict={dict} />
        </TeaserMask>
        {/* 3. DimensionRadar */}
        <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
          <DimensionRadar result={result} dict={dict} />
        </TeaserMask>
        {/* 4. PillarCards */}
        {result.pillars && (
          <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
            <PillarCards result={result} dict={dict} />
          </TeaserMask>
        )}
        {/* 5. IncomeOpportunities（内部 null-guard） */}
        <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
          <IncomeOpportunities result={result} dict={dict} />
        </TeaserMask>
        {/* 6. DealPricing */}
        {result.dealPricing && (
          <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
            <DealPricing result={result} dict={dict} />
          </TeaserMask>
        )}
        {/* 7. RevenueRoadmap（内部 null-guard） */}
        <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
          <RevenueRoadmapSection result={result} dict={dict} />
        </TeaserMask>
        {/* 8. PeerRanking */}
        <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
          <PeerRanking result={result} dict={dict} />
        </TeaserMask>
        {/* 9. GrowthContent（内部 null-guard） */}
        <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
          <GrowthContent result={result} dict={dict} />
        </TeaserMask>
        {/* 10. BrandCommerce（内部 null-guard） */}
        <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
          <BrandCommerce result={result} dict={dict} />
        </TeaserMask>
        {/* 11. RiskHealth */}
        <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
          <RiskHealth result={result} dict={dict} />
        </TeaserMask>
        {/* 12. ThirtyDayPlan */}
        {result.thirtyDayPlan && (
          <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
            <ThirtyDayPlan result={result} dict={dict} />
          </TeaserMask>
        )}
        {/* 13. ShareCard —— 不遮罩 */}
        <ShareCardSection
          result={result}
          dict={dict}
          isPremium={isPremium}
          labels={{
            title: dict.evaluation.shareCard,
            subtitle: 'Save your result and share it.',
            download: dict.evaluation.exportPng,
          }}
        />
        {/* 14. Methodology —— 不遮罩 */}
        <Methodology dict={dict} />
      </div>

      {!isPremium && (
        <UnlockBar
          price="$9"
          ctaText={u.bar}
          includedText={u.included}
          includedItems={dict.reportV2.shell.included}
          onUnlock={onUnlock}
        />
      )}
    </div>
  )
}
