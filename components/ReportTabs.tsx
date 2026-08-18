'use client'

// ── 报告导航：从技术分析维度（Overview/Growth/Revenue/Commerce）改为创作者决策顺序 ──
// Commercial Growth PMF：Snapshot(免费, 含全部 blockers+证据) → Price → 30-Day Plan → Detailed Analysis
// 付费 tab 在免费模式下显示锁定标识（三层钩子中的"锁定价值栈"导航层）。

import { Lock, Star, DollarSign, TrendingUp, BarChart3 } from 'lucide-react'

export type TabId = 'snapshot' | 'deal' | 'plan' | 'analysis'

interface Tab {
  id: TabId
  label: string
  icon: React.ElementType
  /** 免费用户该 tab 是否锁定 */
  locked: boolean
}

export function buildTabs(isPremium: boolean): Tab[] {
  return [
    { id: 'snapshot', label: 'Snapshot', icon: Star, locked: false },
    { id: 'deal', label: 'Price Your Deal', icon: DollarSign, locked: !isPremium },
    { id: 'plan', label: '30-Day Plan', icon: TrendingUp, locked: !isPremium },
    { id: 'analysis', label: 'Detailed Analysis', icon: BarChart3, locked: !isPremium },
  ]
}

interface ReportTabsProps {
  active: TabId
  onChange: (id: TabId) => void
  isPremium: boolean
}

export function ReportTabs({ active, onChange, isPremium }: ReportTabsProps) {
  const tabs = buildTabs(isPremium)
  return (
    <div className="sticky top-20 z-30 mb-8">
      <div className="flex justify-center">
        <div className="inline-flex max-w-full overflow-x-auto rounded-2xl border border-neutral-700/60 bg-[#111115]/95 backdrop-blur p-1.5 shadow-lg shadow-black/30">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = active === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className={`relative shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-[#FF0050] to-[#e6004a] text-white shadow-lg shadow-[#FF0050]/25'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                {tab.locked && (
                  <Lock className={`h-3 w-3 ${isActive ? 'text-white/80' : 'text-neutral-600'}`} />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
