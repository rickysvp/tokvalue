'use client'

import { type TabId } from '@/components/HomePageClient'
import {
  BarChart3, TrendingUp, DollarSign, ShoppingBag,
} from 'lucide-react'

interface Tab {
  id: TabId
  label: string
  icon: React.ElementType
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'growth', label: 'Growth', icon: TrendingUp },
  { id: 'revenue', label: 'Revenue', icon: DollarSign },
  { id: 'commerce', label: 'Commerce', icon: ShoppingBag },
]

interface ReportTabsProps {
  active: TabId
  onChange: (id: TabId) => void
}

export function ReportTabs({ active, onChange }: ReportTabsProps) {
  return (
    <div className="sticky top-20 z-30 mb-8">
      <div className="flex justify-center">
        <div className="inline-flex rounded-2xl border border-neutral-700/60 bg-[#111115]/95 backdrop-blur p-1.5 shadow-lg shadow-black/30">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = active === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className={`relative shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-[#FF0050] to-[#e6004a] text-white shadow-lg shadow-[#FF0050]/25'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export { TABS }
