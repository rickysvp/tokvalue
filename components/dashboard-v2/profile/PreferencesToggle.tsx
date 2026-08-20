'use client'
import React, { useState } from 'react'
import { Card } from '../ui/Card'

export function PreferencesToggle({
  defaults = {}, onChange
}: {
  defaults?: { weeklyEmail?: boolean; hideFreePreview?: boolean }
  onChange?: (key: string, next: boolean) => Promise<any> | void
}) {
  const [state, setState] = useState({
    weeklyEmail: defaults.weeklyEmail !== false,
    hideFreePreview: !!defaults.hideFreePreview,
  })
  const set = async (k: keyof typeof state, v: boolean) => {
    setState(s => ({ ...s, [k]: v }))
    try { await onChange?.(k, v) } catch { setState(s => ({ ...s, [k]: !v })) }
  }
  return (
    <Card className="p-[18px] sm:p-5">
      <div className="text-[11px] uppercase tracking-[0.5px] text-[#6b7280] font-semibold mb-3.5">Preferences</div>
      <div className="flex flex-col gap-3">
        <Row
          title="Weekly growth summary email"
          desc="Every Monday morning: task recap + pillar progress"
          value={state.weeklyEmail}
          onChange={v => set('weeklyEmail', v)}
        />
        <Row
          title="Hide free preview sections on reports"
          desc="Always open full report when unlocked"
          value={state.hideFreePreview}
          onChange={v => set('hideFreePreview', v)}
          divider
        />
      </div>
    </Card>
  )
}

function Row({ title, desc, value, onChange, divider }:
  { title: string; desc: string; value: boolean; onChange: (v: boolean) => void; divider?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${divider ? 'border-t border-[#f3f4f6]' : ''}`}>
      <div className="pr-4">
        <div className="text-[13px] font-medium text-[#111827]">{title}</div>
        <div className="text-[11px] text-[#6b7280]">{desc}</div>
      </div>
      <div
        role="switch" aria-checked={value}
        onClick={() => onChange(!value)}
        className="w-[38px] h-[22px] rounded-full relative cursor-pointer flex-shrink-0"
        style={{ background: value ? '#047857' : '#e5e7eb' }}
      >
        <div className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-all"
          style={{ left: value ? '18px' : '2px', right: 'auto' }} />
      </div>
    </div>
  )
}
