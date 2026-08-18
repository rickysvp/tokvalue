'use client'

// ── Detailed Analysis（付费二级决策页）──
// 深层技术视图：账号健康/节奏/互动质量 + 估值方法论 + 品牌/变现模块。
// 不主导首屏叙事，作为谈判证据的完整技术底稿。

import { Evaluation } from '@/types'
import { useI18n } from '@/lib/i18n'
import { SectionHeader } from '@/components/SectionHeader'
import { DeepAnalysisSection } from '@/components/DeepAnalysisSection'
import { ValuationMethodology } from '@/components/ValuationMethodology'
import { TrendAnalysisSection } from '@/components/sections/TrendAnalysisSection'
import { BrandMatchingSection } from '@/components/sections/BrandMatchingSection'
import { CommercializationSection } from '@/components/sections/CommercializationSection'
import { CommerceReadinessSection } from '@/components/sections/CommerceReadinessSection'
import { Activity, Flame, Building2, DollarSign, ShoppingBag } from 'lucide-react'

interface DetailedAnalysisTabProps {
  result: Evaluation
}

export function DetailedAnalysisTab({ result }: DetailedAnalysisTabProps) {
  const { dict } = useI18n()

  return (
    <>
      <SectionHeader step="01" title={dict.evaluation.sections.deepAnalysis} icon={<Activity className="h-4 w-4" />} />
      <div className="mb-10">
        <DeepAnalysisSection result={result} />
      </div>

      {/* 估值方法论（Account value estimate 的计算依据） */}
      <ValuationMethodology result={result} />

      <SectionHeader step="02" title={dict.evaluation.sections.brandMatching} icon={<Building2 className="h-4 w-4" />} />
      <div className="mb-10">
        <BrandMatchingSection matching={result.brandMatching} />
      </div>

      <SectionHeader step="03" title={dict.evaluation.sections.monetizationAdvice} icon={<DollarSign className="h-4 w-4" />} />
      <div className="mb-10">
        <CommercializationSection advice={result.commercializationAdvice} />
      </div>

      <SectionHeader step="04" title={dict.evaluation.sections.commerceReadiness} icon={<ShoppingBag className="h-4 w-4" />} />
      <div className="mb-10">
        <CommerceReadinessSection readiness={result.commerceReadiness} />
      </div>

      <SectionHeader step="05" title={dict.evaluation.sections.trendAnalysis} icon={<Flame className="h-4 w-4" />} />
      <div className="mb-10">
        <TrendAnalysisSection trendAnalysis={result.trendAnalysis} />
      </div>
    </>
  )
}
