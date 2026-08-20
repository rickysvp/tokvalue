import React from 'react'

export type Chip = { value: string; label: string; count?: number }

export function FilterChips({ chips, value, onChange }:
  { chips: Chip[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1.5 mb-3.5 flex-wrap">
      {chips.map(c => {
        const active = c.value === value
        const label = c.count != null ? `${c.label} (${c.count})` : c.label
        return (
          <button key={c.value} onClick={() => onChange(c.value)}
            className={`text-[11px] px-2.5 py-1 rounded-full font-medium border ${
              active ? 'bg-[#111827] text-white border-[#111827]'
                     : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:text-[#111827]'
            }`}
          >{label}</button>
        )
      })}
    </div>
  )
}
