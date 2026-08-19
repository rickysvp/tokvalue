import { getServerDict } from '@/lib/i18n/server'

export const TIER_COLORS: Record<string, string> = {
  S: '#047857', // Premium Value — 翡翠绿
  A: '#047857',
  B: '#1d4ed8', // Growth Value — 藏蓝
  C: '#1d4ed8',
  D: '#b45309', // Developing Value — 金棕
  E: '#b45309',
  F: '#64748b', // Early Value — 石墨灰
}

export function tierLabel(tier: string): string {
  return (getServerDict().tiers as unknown as Record<string, string>)[tier] || ''
}

export function tierColor(tier: string): string {
  return TIER_COLORS[tier] || '#64748b'
}