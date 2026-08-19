'use client'

import { Evaluation } from '@/types'
import type { EnDict } from '@/lib/i18n/dictionaries/en'
import { VerdictHero } from './sections/VerdictHero'
import { AccountValue } from './sections/AccountValue'
import { PillarCards } from './sections/PillarCards'
import { DealPricing } from './sections/DealPricing'
import { PeerRanking } from './sections/PeerRanking'
import { RiskHealth } from './sections/RiskHealth'
import { ThirtyDayPlan } from './sections/ThirtyDayPlan'
import { ShareCardSection } from './sections/ShareCardSection'
import { Methodology } from './sections/Methodology'
import { TeaserMask } from './TeaserMask'
import { UnlockBar } from './UnlockBar'

export function ReportShell({ result, dict, isPremium, onUnlock }: {
  result: Evaluation
  dict: EnDict
  isPremium: boolean
  onUnlock: () => void
}) {
  const u = dict.reportV2.unlock
  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <VerdictHero result={result} dict={dict} isPremium={isPremium} />

      <div id="unlocked-content" className="scroll-mt-24 space-y-10">
        <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
          <AccountValue result={result} dict={dict} />
        </TeaserMask>
        {result.pillars && (
          <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
            <PillarCards result={result} dict={dict} />
          </TeaserMask>
        )}
        {result.dealPricing && (
          <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
            <DealPricing result={result} dict={dict} />
          </TeaserMask>
        )}
        <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
          <PeerRanking result={result} dict={dict} />
        </TeaserMask>
        <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
          <RiskHealth result={result} dict={dict} />
        </TeaserMask>
        {result.thirtyDayPlan && (
          <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
            <ThirtyDayPlan result={result} dict={dict} />
          </TeaserMask>
        )}
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
