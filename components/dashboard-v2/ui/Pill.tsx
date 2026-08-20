import React from 'react'

type Variant =
  | 'p0' | 'p1' | 'p2'
  | 'tier-premium' | 'tier-growth' | 'tier-developing' | 'tier-early'
  | 'muted'
export function Pill({
  children, variant = 'muted', className = ''
}: { children: React.ReactNode; variant?: Variant; className?: string }) {
  const m: Record<Variant, string> = {
    'p0': 'bg-[#dc262610] text-[#dc2626]',
    'p1': 'bg-[#1d4ed810] text-[#1d4ed8]',
    'p2': 'bg-gray-100 text-gray-600',
    'tier-premium': 'bg-[#04785710] text-[#047857]',
    'tier-growth': 'bg-[#1d4ed810] text-[#1d4ed8]',
    'tier-developing': 'bg-[#b4530910] text-[#b45309]',
    'tier-early': 'bg-gray-100 text-gray-600',
    'muted': 'bg-gray-100 text-gray-600',
  }
  return <span className={`inline-flex items-center text-[10px] sm:text-[11px] font-semibold px-2 sm:px-2.5 py-1 rounded-full ${m[variant]} ${className}`}>{children}</span>
}
